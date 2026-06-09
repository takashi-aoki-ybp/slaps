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
  console.error("Missing KV URL or Token in env");
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
  const songsKey = `${prefix}slaps:songs`;
  console.log(`Fetching from KV key: ${songsKey}`);
  const rawList = await kvFetch(['LRANGE', songsKey, 0, -1]);
  if (!rawList || !Array.isArray(rawList)) {
    console.log("No songs found in KV.");
    return;
  }
  
  console.log(`Found ${rawList.length} songs in KV.`);
  
  const songs = rawList.map(item => JSON.parse(item));
  
  // Search for Biz Markie or Just A Friend
  const query = 'friend';
  const matched = songs.filter(s => {
    const name = (s.name || '').toLowerCase();
    const desc = typeof s.description === 'object' ? Object.values(s.description).join(' ').toLowerCase() : (s.description || '').toLowerCase();
    const user = (s.user_name || '').toLowerCase();
    return name.includes(query) || desc.includes(query) || user.includes(query);
  });
  
  console.log(`Matched songs count for query "${query}": ${matched.length}`);
  if (matched.length > 0) {
    console.log(JSON.stringify(matched, null, 2));
  } else {
    // Print first 5 songs
    console.log("First 5 songs:");
    console.log(JSON.stringify(songs.slice(0, 5), null, 2));
  }
}

run().catch(console.error);
