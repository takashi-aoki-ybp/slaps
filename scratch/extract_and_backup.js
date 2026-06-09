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
const prefix = 'prod:'; // Force correct prefix

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

async function run() {
  const backupDir = path.join(__dirname, '../data/backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // 1. Local songs.json
  const localSongsPath = path.join(__dirname, '../data/songs.json');
  let localSongs = [];
  if (fs.existsSync(localSongsPath)) {
    localSongs = JSON.parse(fs.readFileSync(localSongsPath, 'utf8'));
    const localBackupPath = path.join(backupDir, `backup_local_prod_${timestamp}.json`);
    fs.writeFileSync(localBackupPath, JSON.stringify(localSongs, null, 2), 'utf8');
    console.log(`Backed up local songs to: ${localBackupPath}`);
  }

  // 2. KV songs
  const songsKey = `${prefix}slaps:songs`;
  const rawKvList = await kvFetch(['LRANGE', songsKey, 0, -1]);
  let kvSongs = [];
  if (rawKvList && Array.isArray(rawKvList)) {
    kvSongs = rawKvList.map(item => JSON.parse(item));
    const kvBackupPath = path.join(backupDir, `backup_kv_prod_${timestamp}.json`);
    fs.writeFileSync(kvBackupPath, JSON.stringify(kvSongs, null, 2), 'utf8');
    console.log(`Backed up production KV songs to: ${kvBackupPath}`);
  }

  // 3. Merge matching the API logic (KV overrides local, union of all)
  const localMap = new Map(localSongs.map(s => [s.youtube_id, s]));
  const dbMap = new Map(kvSongs.map(s => [s.youtube_id, s]));
  const allIds = new Set([...dbMap.keys(), ...localMap.keys()]);
  
  const merged = [];
  for (const id of allIds) {
    if (dbMap.has(id)) {
      const dbSong = dbMap.get(id);
      const localSong = localMap.get(id);
      if (localSong && localSong.promo) {
        dbSong.promo = true;
      }
      merged.push(dbSong);
    } else {
      merged.push(localMap.get(id));
    }
  }

  console.log(`Merged total unique songs count: ${merged.length}`);

  // Write merged output to scratch for analysis
  const outputPath = path.join(__dirname, 'all_songs_unified.json');
  fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`Unified songs written to: ${outputPath}`);
}

run().catch(console.error);
