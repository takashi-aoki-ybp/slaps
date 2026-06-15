const fs = require('fs');
const path = require('path');

// ロード
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

const EXCLUDE_IDS = [
  'QLEc84xQRQM', // 女王蜂
  'AaMmSNBt_O8', // KID PHENOMENON
  'iR5vQeUQ32Q', // ShowMinorSavage
  '0izBEKMf-3Q', // Number_i - LAVALAVA
  'JPQqPJqY_Lo', // Number_i - ATAMI
  'IoDViKwXqjw', // Number_i - i-mode
  'Zv6JKobJyFY', // BTS - Hooligan
  '1Wl1B7DPegc', // The 1975 - Love It If We Made It
  'kdvce-9H_HU', // Novel Core
  '-XpAW0jXA10'  // KUROMI
];

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
  console.log("=== VERIFYING DELETIONS ===");
  
  // 1. ローカル data/songs.json のチェック
  const songsPath = path.join(__dirname, '../data/songs.json');
  const localSongs = JSON.parse(fs.readFileSync(songsPath, 'utf8'));
  console.log(`Checking local file data/songs.json (${localSongs.length} songs)...`);
  
  let localFoundCount = 0;
  for (const song of localSongs) {
    if (EXCLUDE_IDS.includes(song.youtube_id)) {
      console.error(`ERROR: Found deleted song in local file: "${song.name}" (ID: ${song.youtube_id})`);
      localFoundCount++;
    }
  }
  if (localFoundCount === 0) {
    console.log("  -> SUCCESS: None of the deleted songs exist in local data/songs.json.");
  }

  // 2. Vercel KV のチェック
  const songsKey = `${prefix}slaps:songs`;
  console.log(`Checking Vercel KV key: ${songsKey}...`);
  const rawList = await kvFetch(['LRANGE', songsKey, 0, -1]);
  if (!rawList || !Array.isArray(rawList)) {
    console.error("ERROR: No songs found in Vercel KV.");
    return;
  }
  
  const kvSongs = rawList.map(item => JSON.parse(item));
  console.log(`Checking Vercel KV list (${kvSongs.length} songs)...`);
  
  let kvFoundCount = 0;
  for (const song of kvSongs) {
    if (EXCLUDE_IDS.includes(song.youtube_id)) {
      console.error(`ERROR: Found deleted song in Vercel KV: "${song.name}" (ID: ${song.youtube_id})`);
      kvFoundCount++;
    }
  }
  if (kvFoundCount === 0) {
    console.log("  -> SUCCESS: None of the deleted songs exist in Vercel KV list.");
  }
  
  // 3. existing_ids セットのチェック
  const existingKey = `${prefix}slaps:existing_ids`;
  console.log(`Checking existing_ids in Vercel KV...`);
  
  let existingFoundCount = 0;
  for (const id of EXCLUDE_IDS) {
    const isMember = await kvFetch(['SISMEMBER', existingKey, id]);
    if (isMember === 1) {
      console.error(`ERROR: Deleted ID still exists in existing_ids set: ${id}`);
      existingFoundCount++;
    }
  }
  if (existingFoundCount === 0) {
    console.log("  -> SUCCESS: None of the deleted IDs exist in existing_ids set.");
  }
  
  console.log("\nVerification complete.");
}

run().catch(console.error);
