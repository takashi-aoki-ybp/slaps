const fs = require('fs');
const path = require('path');

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
  console.error("Missing KV URL or Token");
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

const deleteIds = [
  "YjC0vvPGiKk",
  "2jTshYqJpG8",
  "N1yMLZ_d1tI",
  "f0Tq1qS5z7k",
  "h1cKt-1JzE0",
  "u36Zp_L2h4k",
  "jTglS3RUSgA",
  "A1B2C3D4E5J",
  "A1B2C3D4E5I",
  "A1B2C3D4E5H",
  "A1B2C3D4E5G",
  "3S1tP7S-uLg",
  "8V94XvDq_m8",
  "3tmd-ClpJKA"
];

async function run() {
  const songsPath = path.join(__dirname, '../data/songs.json');
  const localSongs = JSON.parse(fs.readFileSync(songsPath, 'utf8'));
  console.log(`Local songs count: ${localSongs.length}`);

  const songsKey = `${prefix}slaps:songs`;
  const existingKey = `${prefix}slaps:existing_ids`;
  const brokenKey = `${prefix}slaps:broken`;

  console.log("1. Cleaning prod:slaps:songs list...");
  // Delete the old list
  await kvFetch(['DEL', songsKey]);
  // Push all local songs to the list (in chunks to avoid payload size limit)
  const chunkSize = 50;
  for (let i = 0; i < localSongs.length; i += chunkSize) {
    const chunk = localSongs.slice(i, i + chunkSize).map(s => JSON.stringify(s));
    await kvFetch(['RPUSH', songsKey, ...chunk]);
  }
  console.log("  -> List synced successfully.");

  console.log("2. Removing deleted IDs from existing_ids set...");
  const existingType = await kvFetch(['TYPE', existingKey]);
  console.log(`  -> existing_ids type: ${existingType}`);
  if (existingType === 'set') {
    for (const id of deleteIds) {
      await kvFetch(['SREM', existingKey, id]);
    }
  } else if (existingType === 'hash') {
    for (const id of deleteIds) {
      await kvFetch(['HDEL', existingKey, id]);
    }
  }
  console.log("  -> IDs removed from existing_ids successfully.");

  console.log("3. Removing deleted IDs from broken hash...");
  for (const id of deleteIds) {
    await kvFetch(['HDEL', brokenKey, id]);
  }
  console.log("  -> IDs removed from broken successfully.");

  console.log("\nKV SYNC CLEANUP COMPLETED.");
}

run().catch(console.error);
