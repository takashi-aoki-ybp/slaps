const fs = require('fs');
const path = require('path');

// Load environment variables from .env.prod.local
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
  const localSongsPath = path.join(__dirname, '../data/songs.json');
  let localSongs = [];
  if (fs.existsSync(localSongsPath)) {
    localSongs = JSON.parse(fs.readFileSync(localSongsPath, 'utf8'));
  }

  const songsKey = `${prefix}slaps:songs`;
  const rawKvList = await kvFetch(['LRANGE', songsKey, 0, -1]);
  let kvSongs = [];
  if (rawKvList && Array.isArray(rawKvList)) {
    kvSongs = rawKvList.map(item => JSON.parse(item));
  }

  function needsClassification(song) {
    const region = (song.region || '').toLowerCase();
    const era = (song.era || '').toLowerCase();
    const mood = song.conscious_turnt;
    return region === 'other' || region === '' || era === 'other' || era === '' || mood === 2.5 || mood === 3;
  }

  const localTargets = localSongs.filter(needsClassification);
  const kvTargets = kvSongs.filter(needsClassification);

  const uniqueTargetsMap = new Map();
  localTargets.forEach(s => uniqueTargetsMap.set(s.youtube_id, s));
  kvTargets.forEach(s => uniqueTargetsMap.set(s.youtube_id, s));

  const targets = Array.from(uniqueTargetsMap.values()).map(s => ({
    youtube_id: s.youtube_id,
    name: s.name,
    description: typeof s.description === 'object' ? Object.values(s.description).join(' ') : (s.description || '')
  }));

  const targetsPath = path.join(__dirname, '../data/targets.json');
  fs.writeFileSync(targetsPath, JSON.stringify(targets, null, 2), 'utf8');
  console.log(`Successfully extracted ${targets.length} target songs to: ${targetsPath}`);
}

run().catch(console.error);
