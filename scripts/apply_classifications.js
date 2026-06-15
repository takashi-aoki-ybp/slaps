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

if (!url || !token) {
  console.error("Error: KV_REST_API_URL and KV_REST_API_TOKEN must be set in .env.prod.local");
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

async function run() {
  const writeMode = process.argv.includes('--write');
  console.log(`Mode: ${writeMode ? '★ WRITE MODE (Updates will be applied!)' : '☆ DRY-RUN MODE (No database modification)'}`);

  // Load classifications
  const classificationsPath = path.join(__dirname, '../data/classifications.json');
  if (!fs.existsSync(classificationsPath)) {
    console.error("Error: classifications.json not found");
    process.exit(1);
  }
  const classifications = JSON.parse(fs.readFileSync(classificationsPath, 'utf8'));

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

  console.log(`\nApplying updates...`);
  
  function applyUpdates(songList, sourceName) {
    let listChanged = 0;
    const updated = songList.map(song => {
      const result = classifications[song.youtube_id];
      if (result) {
        const oldRegion = song.region;
        const oldEra = song.era;
        const oldMood = song.conscious_turnt;

        // Verify that we are not touching comments or submitter details
        const newRegion = result.region || song.region;
        const newEra = result.era || song.era;
        const newMood = result.conscious_turnt !== undefined ? result.conscious_turnt : song.conscious_turnt;

        if (oldRegion !== newRegion || oldEra !== newEra || oldMood !== newMood) {
          console.log(`[${sourceName}] "${song.name}" (${song.youtube_id}):`);
          if (oldRegion !== newRegion) console.log(`  - Region: "${oldRegion}" -> "${newRegion}"`);
          if (oldEra !== newEra) console.log(`  - Era: "${oldEra}" -> "${newEra}"`);
          if (oldMood !== newMood) console.log(`  - Mood: ${oldMood} -> ${newMood}`);
          
          listChanged++;
          return {
            ...song,
            region: newRegion,
            era: newEra,
            conscious_turnt: newMood
          };
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
    console.log("No data updates required.");
    return;
  }

  if (writeMode) {
    // 1. Write back to local songs.json
    if (localResult.listChanged > 0) {
      console.log(`Writing ${localSongs.length} songs to local songs.json...`);
      fs.writeFileSync(localSongsPath, JSON.stringify(localResult.updated, null, 2), 'utf8');
      console.log("-> Local songs.json updated successfully.");
    }

    // 2. Write back to Vercel KV
    if (kvResult.listChanged > 0) {
      console.log(`Writing ${kvSongs.length} songs to Vercel KV...`);
      await kvFetch(['DEL', songsKey]);
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
