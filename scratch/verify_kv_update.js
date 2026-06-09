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
const prefix = process.env.DB_PREFIX || 'prod:';

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

async function check() {
  const songsKey = `${prefix}slaps:songs`;
  const rawList = await kvFetch(['LRANGE', songsKey, 0, -1]);
  if (!rawList) {
    console.error("Failed to read KV");
    return;
  }
  const songs = rawList.map(item => JSON.parse(item));
  
  // Search for Biz Markie
  const biz = songs.find(s => s.youtube_id === '9aofoBrFNdg');
  console.log("Biz Markie in KV:");
  console.log(JSON.stringify(biz, null, 2));

  // Search for Ante Up Remix
  const ante = songs.find(s => s.youtube_id === 'PLT68mI5Pwc');
  console.log("Ante Up Remix in KV:");
  console.log(JSON.stringify(ante, null, 2));

  // Count if there are any songs with conscious_turnt = 2.5 or 3
  const intermediate = songs.filter(s => s.conscious_turnt === 2.5 || s.conscious_turnt === 3);
  console.log(`\nRemaining intermediate songs count (2.5 or 3): ${intermediate.length}`);
}

check().catch(console.error);
