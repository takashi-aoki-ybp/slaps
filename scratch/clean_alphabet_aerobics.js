const fs = require('fs');
const path = require('path');

// .env.local から環境変数をパースして適用
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  envText.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^"(.*)"$/, '$1');
      process.env[key] = val;
    }
  });
}

const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;

if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
  console.error("Missing KV environment variables");
  process.exit(1);
}

async function kvFetch(command) {
  const res = await fetch(KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`KV error: ${res.statusText}`);
  const data = await res.json();
  return data.result;
}

async function main() {
  console.log("Fetching songs list from Vercel KV...");
  const rawList = await kvFetch(['LRANGE', 'slaps:songs', 0, -1]);
  if (!rawList || !Array.isArray(rawList)) {
    console.error("Failed to fetch songs list");
    return;
  }

  let targetIndex = -1;
  let targetSong = null;

  for (let i = 0; i < rawList.length; i++) {
    try {
      const song = JSON.parse(rawList[i]);
      if (song.youtube_id === "8D5iyKXZcUQ") {
        targetIndex = i;
        targetSong = song;
        break;
      }
    } catch (e) {
      // ignore
    }
  }

  if (targetIndex === -1) {
    console.log("Target song (8D5iyKXZcUQ) not found in KV list.");
    return;
  }

  console.log("Found song in KV:", targetSong);
  
  // 曲名のクレンジング修正
  targetSong.name = "Blackalicious - Alphabet Aerobics";
  console.log("Updating name to:", targetSong.name);

  // Redis の LSET でインデックス番号の値を更新
  const updatedJson = JSON.stringify(targetSong);
  await kvFetch(['LSET', 'slaps:songs', targetIndex, updatedJson]);
  console.log("Successfully updated song name in Vercel KV!");
}

main().catch(console.error);
