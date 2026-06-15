const fs = require('fs');
const path = require('path');

// Manually load .env.prod.local to connect to production KV
const envPath = path.join(__dirname, '../.env.prod.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const prefix = process.env.DB_PREFIX || '';

// OpenRouter/Gemini keys
const openrouterKey = process.env.OPENROUTER_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

if (!url || !token) {
  console.error("Error: KV_REST_API_URL and KV_REST_API_TOKEN must be set in .env.prod.local");
  process.exit(1);
}

if (!openrouterKey && !geminiKey) {
  console.error("Error: OPENROUTER_API_KEY or GEMINI_API_KEY must be set in your environment.");
  process.exit(1);
}

async function kvFetch(command) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`KV error: ${res.statusText}`);
  const data = await res.json();
  return data.result;
}

// Gemini / OpenRouter API caller
async function callLLM(prompt) {
  if (geminiKey) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    if (!res.ok) throw new Error(`Gemini API error: ${res.statusText}`);
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  } else if (openrouterKey) {
    const openrouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
    const res = await fetch(openrouterUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) throw new Error(`OpenRouter API error: ${res.statusText}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }
}

// Helper for sleep to avoid rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const writeMode = process.argv.includes('--write');
  console.log(`Mode: ${writeMode ? '★ WRITE MODE (Updates will be applied!)' : '☆ DRY-RUN MODE (No database modification)'}`);

  // Create backup directory
  const backupDir = path.join(__dirname, '../data/backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // 1. Process Local songs.json
  const localSongsPath = path.join(__dirname, '../data/songs.json');
  let localSongs = [];
  if (fs.existsSync(localSongsPath)) {
    localSongs = JSON.parse(fs.readFileSync(localSongsPath, 'utf8'));
    // Backup local
    const localBackupPath = path.join(backupDir, `backup_local_${timestamp}.json`);
    fs.writeFileSync(localBackupPath, JSON.stringify(localSongs, null, 2), 'utf8');
    console.log(`-> Backed up local songs.json to: ${localBackupPath}`);
  }

  // 2. Process KV songs
  const songsKey = `${prefix}slaps:songs`;
  console.log(`Fetching songs from KV key: ${songsKey}...`);
  const rawKvList = await kvFetch(['LRANGE', songsKey, 0, -1]);
  let kvSongs = [];
  if (rawKvList && Array.isArray(rawKvList)) {
    kvSongs = rawKvList.map(item => JSON.parse(item));
    // Backup KV
    const kvBackupPath = path.join(backupDir, `backup_kv_${timestamp}.json`);
    fs.writeFileSync(kvBackupPath, JSON.stringify(kvSongs, null, 2), 'utf8');
    console.log(`-> Backed up KV songs to: ${kvBackupPath}`);
  }

  // Combine datasets to perform unified classification
  console.log(`\nAnalyzing songs...`);
  console.log(`- Local songs: ${localSongs.length}`);
  console.log(`- KV songs: ${kvSongs.length}`);

  // Target songs that need classification
  function needsClassification(song) {
    const region = (song.region || '').toLowerCase();
    const era = (song.era || '').toLowerCase();
    const mood = song.conscious_turnt;
    return region === 'other' || region === '' || era === 'other' || era === '' || mood === 2.5 || mood === 3;
  }

  const allSongsToClassify = [];
  const localTargets = localSongs.filter(needsClassification);
  const kvTargets = kvSongs.filter(needsClassification);

  console.log(`\nTarget songs to classify:`);
  console.log(`- Local targets: ${localTargets.length}`);
  console.log(`- KV targets: ${kvTargets.length}`);

  // We map by youtube_id to avoid classifying the same song twice
  const uniqueTargetsMap = new Map();
  localTargets.forEach(s => uniqueTargetsMap.set(s.youtube_id, s));
  kvTargets.forEach(s => uniqueTargetsMap.set(s.youtube_id, s));

  const uniqueTargets = Array.from(uniqueTargetsMap.values());
  console.log(`- Unique target songs to process via LLM: ${uniqueTargets.length}`);

  if (uniqueTargets.length === 0) {
    console.log("No songs require classification.");
    return;
  }

  // Classify in batches of 15 songs to avoid payload/token limitations and respect rate limits
  const batchSize = 15;
  const classificationResults = {};

  for (let i = 0; i < uniqueTargets.length; i += batchSize) {
    const batch = uniqueTargets.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueTargets.length / batchSize)} (${batch.length} songs)...`);

    const batchInput = batch.map(s => ({
      id: s.youtube_id,
      name: s.name,
      comment: typeof s.description === 'object' ? Object.values(s.description).join(' ') : (s.description || '')
    }));

    const prompt = `You are an expert hip-hop music analyst. Your task is to classify a list of hip-hop songs.
For each song, classify:
1. Region: Choose from "us" (United States), "jp" (Japan), "uk" (United Kingdom), "kr" (South Korea), "fr" (France).
2. Era: Choose from "90s", "00s", "10s", "20s".
3. Conscious vs Turnt mood: Assign a score from 0.0 to 5.0.
   - 0.0 to 2.0: Conscious (mellow, lyrical, introspective, jazzy, boom-bap, political).
   - 3.5 to 5.0: Turnt (trap, drill, club bangers, high-energy, hype).
   - Crucially, you MUST NOT output values in the range [2.1, 3.4]. Force it to be either Conscious (<2.5) or Turnt (>3.0). Do not output intermediate values like 2.5 or 3.0.

Input songs:
${JSON.stringify(batchInput, null, 2)}

Return a JSON object containing a "results" map where keys are the song IDs, matching this exact structure:
{
  "results": {
    "YjC0vvPGiKk": {
      "region": "kr" | "us" | "jp" | "uk" | "fr",
      "era": "90s" | "00s" | "10s" | "20s",
      "conscious_turnt": number
    }
  }
}
`;

    try {
      const rawResponse = await callLLM(prompt);
      // Clean up response if it has markdown formatting
      const cleanJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      if (parsed.results) {
        Object.assign(classificationResults, parsed.results);
      } else {
        console.error("Invalid response format received from LLM", rawResponse);
      }
    } catch (e) {
      console.error(`Failed to process batch:`, e);
    }

    // Wait a bit to avoid hitting rate limits
    await sleep(2000);
  }

  // Print differences/preview
  console.log("\n=================== CLASSIFICATION PREVIEW ===================");
  let changedCount = 0;
  
  function applyUpdates(songList, sourceName) {
    let listChanged = 0;
    const updated = songList.map(song => {
      const result = classificationResults[song.youtube_id];
      if (result) {
        const oldRegion = song.region;
        const oldEra = song.era;
        const oldMood = song.conscious_turnt;

        // Apply new values
        const newRegion = result.region || song.region;
        const newEra = result.era || song.era;
        const newMood = result.conscious_turnt !== undefined ? result.conscious_turnt : song.conscious_turnt;

        if (oldRegion !== newRegion || oldEra !== newEra || oldMood !== newMood) {
          console.log(`[${sourceName}] "${song.name}" (${song.youtube_id}):`);
          if (oldRegion !== newRegion) console.log(`  - Region: "${oldRegion}" -> "${newRegion}"`);
          if (oldEra !== newEra) console.log(`  - Era: "${oldEra}" -> "${newEra}"`);
          if (oldMood !== newMood) console.log(`  - Mood: ${oldMood} -> ${newMood}`);
          
          listChanged++;
          return { ...song, region: newRegion, era: newEra, conscious_turnt: newMood };
        }
      }
      return song;
    });
    return { updated, listChanged };
  }

  const localResult = applyUpdates(localSongs, "Local");
  const kvResult = applyUpdates(kvSongs, "KV");

  const totalChanges = localResult.listChanged + kvResult.listChanged;
  console.log(`\nTotal proposed changes: ${totalChanges}`);
  console.log("==============================================================\n");

  if (totalChanges === 0) {
    console.log("No data updates required. DB is clean.");
    return;
  }

  if (writeMode) {
    // 1. Write back to local songs.json
    if (localResult.listChanged > 0) {
      console.log(`Writing ${localSongs.length} songs (with ${localResult.listChanged} updates) to local songs.json...`);
      fs.writeFileSync(localSongsPath, JSON.stringify(localResult.updated, null, 2), 'utf8');
      console.log("-> Local songs.json updated successfully.");
    }

    // 2. Write back to Vercel KV
    if (kvResult.listChanged > 0) {
      console.log(`Writing ${kvSongs.length} songs (with ${kvResult.listChanged} updates) to Vercel KV...`);
      // Delete existing
      await kvFetch(['DEL', songsKey]);
      // Chunk writes to avoid exceeding payload sizes (max 50 per chunk)
      const chunkSize = 50;
      const jsonStrings = kvResult.updated.map(s => JSON.stringify(s));
      for (let i = 0; i < jsonStrings.length; i += chunkSize) {
        const chunk = jsonStrings.slice(i, i + chunkSize);
        await kvFetch(['RPUSH', songsKey, ...chunk]);
      }
      console.log("-> Vercel KV songs updated successfully.");
    }
  } else {
    console.log("☆ Dry-Run complete. Run with '--write' flag to apply these changes.");
  }
}

run().catch(console.error);
