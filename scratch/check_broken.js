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
  console.log("Fetching broken keys...");
  // HGETALL or SMEMBERS depend on type.
  // slaps:broken is likely a SET or HASH. Let's try TYPE first.
  const type = await kvFetch(['TYPE', 'prod:slaps:broken']);
  console.log("Type of prod:slaps:broken:", type);
  
  let result;
  if (type === 'set') {
    result = await kvFetch(['SMEMBERS', 'prod:slaps:broken']);
  } else if (type === 'hash') {
    result = await kvFetch(['HGETALL', 'prod:slaps:broken']);
  } else if (type === 'zset') {
    result = await kvFetch(['ZRANGE', 'prod:slaps:broken', 0, -1]);
  } else {
    result = await kvFetch(['GET', 'prod:slaps:broken']);
  }
  
  console.log("Broken songs in KV:", result);
}

run().catch(console.error);
