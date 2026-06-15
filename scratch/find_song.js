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
  // 1. Local songs
  const localSongsPath = path.join(__dirname, '../data/songs.json');
  let localSongs = [];
  if (fs.existsSync(localSongsPath)) {
    localSongs = JSON.parse(fs.readFileSync(localSongsPath, 'utf8'));
  }

  // 2. KV songs
  const songsKey = `${prefix}slaps:songs`;
  const rawKvList = await kvFetch(['LRANGE', songsKey, 0, -1]);
  let kvSongs = [];
  if (rawKvList && Array.isArray(rawKvList)) {
    kvSongs = rawKvList.map(item => JSON.parse(item));
  }

  const allSongs = [...localSongs, ...kvSongs];
  console.log(`Total songs combined: ${allSongs.length}`);

  const targets = ['biz', 'markie', 'friend', 'つねきち', 'tsunekichi'];
  
  targets.forEach(query => {
    const matched = allSongs.filter(s => {
      const name = (s.name || '').toLowerCase();
      const desc = typeof s.description === 'object' ? Object.values(s.description).join(' ').toLowerCase() : (s.description || '').toLowerCase();
      const user = (s.user_name || '').toLowerCase();
      return name.includes(query) || desc.includes(query) || user.includes(query);
    });
    console.log(`Query "${query}": found ${matched.length} matches.`);
    if (matched.length > 0) {
      matched.forEach(m => {
        console.log(` - ID: ${m.youtube_id}, Name: "${m.name}", User: "${m.user_name}", Region: "${m.region}", Era: "${m.era}", Mood: ${m.conscious_turnt}`);
      });
    }
  });

  // Also search for any song with region "jp" but containing english words like "video" or obvious western names
  // Let's print some "jp" songs to see what they look like
  console.log("\nSome JP songs:");
  const jpSongs = allSongs.filter(s => s.region === 'jp');
  console.log(`Total JP songs: ${jpSongs.length}`);
  jpSongs.slice(0, 10).forEach(s => {
    console.log(` - ${s.name} (by ${s.user_name})`);
  });
}

run().catch(console.error);
