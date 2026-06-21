const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '../.env.prod.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?s*$/);
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
const prefix = 'prod:';

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
  // Fetch ALL songs from prod KV
  const songsKey = `${prefix}slaps:songs`;
  const rawList = await kvFetch(['LRANGE', songsKey, 0, -1]);
  const kvSongs = rawList.map(item => JSON.parse(item));
  console.log(`Total KV songs: ${kvSongs.length}`);

  // Search for Fight Song, Kvi Baba, NORIKIYO in KV
  const queries = ['fight song', 'kvi baba', 'norikiyo', 'vigorman'];
  for (const query of queries) {
    const matched = kvSongs.filter(s => {
      const name = (s.name || '').toLowerCase();
      const descJa = typeof s.description === 'object' ? (s.description.ja || '').toLowerCase() : (s.description || '').toLowerCase();
      const descEn = typeof s.description === 'object' ? (s.description.en || '').toLowerCase() : '';
      return name.includes(query) || descJa.includes(query) || descEn.includes(query);
    });
    console.log(`\n=== KV search: "${query}" — ${matched.length} results ===`);
    for (const s of matched) {
      const descJa = typeof s.description === 'object' ? s.description.ja : s.description;
      const descEn = typeof s.description === 'object' ? s.description.en : '';
      console.log(`  ID: ${s.youtube_id}`);
      console.log(`  Name: ${s.name}`);
      console.log(`  Desc JA: ${descJa}`);
      console.log(`  Desc EN: ${descEn}`);
      console.log(`  Region: ${s.region} | Era: ${s.era} | CT: ${s.conscious_turnt}`);
      console.log('  ---');
    }
  }

  // Also check the 3 songs that are in KV but not local
  const localSongs = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/songs.json'), 'utf8'));
  const localIds = new Set(localSongs.map(s => s.youtube_id));
  const kvOnly = kvSongs.filter(s => !localIds.has(s.youtube_id));
  console.log(`\n=== ALL SONGS IN KV BUT NOT LOCAL (${kvOnly.length}) — FULL DETAILS ===`);
  for (const s of kvOnly) {
    console.log(JSON.stringify(s, null, 2));
    console.log('---');
  }
}

run().catch(console.error);
