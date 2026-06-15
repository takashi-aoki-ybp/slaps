const fs = require('fs');
const path = require('path');

// Load env for KV
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

const kvUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;

async function kvFetch(command) {
  if (!kvUrl || !kvToken) return null;
  try {
    const res = await fetch(kvUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kvToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result;
  } catch (e) {
    return null;
  }
}

// Helper to delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function checkYoutubeOEmbed(youtubeId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.status === 404 || res.status === 400 || res.status === 401) {
      return { valid: false, status: res.status, reason: 'oEmbed 404/Bad Request (Deleted/Private)' };
    }
    if (!res.ok) {
      return { valid: true, status: res.status, warn: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { valid: true, title: data.title, author: data.author_name };
  } catch (err) {
    // Timeout or network error
    return { valid: true, error: err.message || 'fetch error' };
  }
}

async function run() {
  const songsPath = path.join(__dirname, '../data/songs.json');
  if (!fs.existsSync(songsPath)) {
    console.error("songs.json not found");
    process.exit(1);
  }
  
  const songs = JSON.parse(fs.readFileSync(songsPath, 'utf8'));
  console.log(`Loaded ${songs.length} songs from songs.json.`);
  
  // Fetch broken list from KV
  console.log("Fetching broken logs from Vercel KV...");
  const brokenData = await kvFetch(['HGETALL', 'prod:slaps:broken']);
  const brokenMap = new Map();
  if (brokenData && Array.isArray(brokenData)) {
    for (let i = 0; i < brokenData.length; i += 2) {
      brokenMap.set(brokenData[i], parseInt(brokenData[i+1], 10));
    }
  }
  console.log(`Loaded ${brokenMap.size} broken entries from KV.`);

  const results = [];
  const concurrency = 5; // Low concurrency to prevent rate limits
  
  console.log(`Checking ${songs.length} songs with concurrency=${concurrency}...`);
  
  for (let i = 0; i < songs.length; i += concurrency) {
    const batch = songs.slice(i, i + concurrency);
    const promises = batch.map(async (song) => {
      const ytId = song.youtube_id;
      const oembedRes = await checkYoutubeOEmbed(ytId);
      const kvBrokenCount = brokenMap.get(ytId) || 0;
      
      return {
        song,
        oembed: oembedRes,
        kvBrokenCount
      };
    });
    
    const batchRes = await Promise.all(promises);
    results.push(...batchRes);
    
    // Progress print
    if ((i + concurrency) % 50 === 0 || i + concurrency >= songs.length) {
      console.log(`Checked ${Math.min(i + concurrency, songs.length)} / ${songs.length} songs...`);
    }
    
    await sleep(80); // Small delay between batches to be polite to YouTube APIs
  }
  
  // Analyze results
  const deletedSongs = [];
  const highlyBrokenSongs = []; // oEmbed works, but flagged in KV >= 3 times
  const cleanSongs = [];
  
  for (const item of results) {
    const { song, oembed, kvBrokenCount } = item;
    
    if (oembed.valid === false) {
      deletedSongs.push({
        song,
        reason: oembed.reason,
        kvBrokenCount
      });
    } else if (kvBrokenCount >= 3) {
      highlyBrokenSongs.push({
        song,
        reason: `KV Broken Count is ${kvBrokenCount} (Likely embedding block/country restriction)`,
        oembed
      });
    } else {
      cleanSongs.push(song);
    }
  }
  
  console.log("\n=================================");
  console.log(`VALIDATION COMPLETED.`);
  console.log(`Clean songs: ${cleanSongs.length}`);
  console.log(`Deleted/Private songs: ${deletedSongs.length}`);
  console.log(`Highly flagged (Broken in KV >= 3): ${highlyBrokenSongs.length}`);
  console.log("=================================\n");
  
  const report = {
    timestamp: new Date().toISOString(),
    totalSongs: songs.length,
    cleanSongsCount: cleanSongs.length,
    deletedSongs,
    highlyBrokenSongs
  };
  
  fs.writeFileSync(
    path.join(__dirname, 'song_cleanup_report.json'),
    JSON.stringify(report, null, 2)
  );
  console.log("Saved detailed report to scratch/song_cleanup_report.json");
}

run().catch(console.error);
