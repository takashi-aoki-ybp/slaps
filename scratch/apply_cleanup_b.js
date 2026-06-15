const fs = require('fs');
const path = require('path');

// Load env
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

const replaceMapping = {
  "YjC0vvPGiKk": "ckZor7HRU1E", // BewhY - GOTTASADAE
  "2jTshYqJpG8": "lbeUyW6axeA", // Gazo ft. Freeze Corleone - Drill FR 4
  "N1yMLZ_d1tI": "t5Ps8Nw-TWI", // Joey Bada$$ - Paper Trail$
  "f0Tq1qS5z7k": "orZdl3KqgzU", // Shing02 - Luv(sic) Part 2
  "h1cKt-1JzE0": "hxfGQ2AJHGk", // Little Simz - Introvert
  "u36Zp_L2h4k": "Agp7tDPbk0o", // Sexyy Red - Pound Town
  "jTglS3RUSgA": "8nc6EgF5WX4"  // Time Machine - Personal Ads
};

async function run() {
  const songsPath = path.join(__dirname, '../data/songs.json');
  if (!fs.existsSync(songsPath)) {
    console.error("songs.json not found");
    process.exit(1);
  }

  const songs = JSON.parse(fs.readFileSync(songsPath, 'utf8'));
  let updatedCount = 0;

  for (const song of songs) {
    const oldId = song.youtube_id;
    if (replaceMapping[oldId]) {
      const newId = replaceMapping[oldId];
      song.youtube_id = newId;
      // Also update thumbnail if exists
      if (song.thumbnail) {
        song.thumbnail = `https://img.youtube.com/vi/${newId}/mqdefault.jpg`;
      }
      console.log(`Updated "${song.name}": ${oldId} -> ${newId}`);
      updatedCount++;
    }
  }

  console.log(`Updated ${updatedCount} songs locally.`);
  fs.writeFileSync(songsPath, JSON.stringify(songs, null, 2) + '\n');
  console.log("Local songs.json saved.");

  // Apply to KV
  const songsKey = `${prefix}slaps:songs`;
  const existingKey = `${prefix}slaps:existing_ids`;
  const brokenKey = `${prefix}slaps:broken`;

  console.log("1. Syncing prod:slaps:songs list to Vercel KV...");
  await kvFetch(['DEL', songsKey]);
  const chunkSize = 50;
  for (let i = 0; i < songs.length; i += chunkSize) {
    const chunk = songs.slice(i, i + chunkSize).map(s => JSON.stringify(s));
    await kvFetch(['RPUSH', songsKey, ...chunk]);
  }
  console.log("  -> KV List synced successfully.");

  console.log("2. Updating existing_ids (removing old, adding new)...");
  const existingType = await kvFetch(['TYPE', existingKey]);
  if (existingType === 'set') {
    for (const [oldId, newId] of Object.entries(replaceMapping)) {
      await kvFetch(['SREM', existingKey, oldId]);
      await kvFetch(['SADD', existingKey, newId]);
    }
  } else if (existingType === 'hash') {
    for (const [oldId, newId] of Object.entries(replaceMapping)) {
      await kvFetch(['HDEL', existingKey, oldId]);
      await kvFetch(['HSET', existingKey, newId, '1']);
    }
  }
  console.log("  -> KV existing_ids updated successfully.");

  console.log("3. Removing old IDs from broken log...");
  for (const oldId of Object.keys(replaceMapping)) {
    await kvFetch(['HDEL', brokenKey, oldId]);
  }
  console.log("  -> KV broken log updated successfully.");

  console.log("\nKV DATA SYNC COMPLETED SUCCESSFULLY.");
}

run().catch(console.error);
