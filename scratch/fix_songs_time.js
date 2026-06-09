const fs = require('fs');
const path = require('path');

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const prefix = process.env.DB_PREFIX || '';
const songsJsonPath = path.join(__dirname, '../data/songs.json');

const TARGET_IDS = [
  "iGbeZNqklic",
  "vn9xLph8KwQ",
  "WdzoMl9t814",
  "AXeugCTXsNs",
  "eCGV26aj-mM",
  "8KcI1lp90GA",
  "AzqMHkYNSLc",
  "KyYQcms0Shg",
  "0s76k0nRdxw",
  "Q5fgRm_gblk",
  "61wtT8Jfmog",
  "SwOYIntD1Wk"
];

if (!url || !token) {
  console.error("Error: KV_REST_API_URL and KV_REST_API_TOKEN must be set.");
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
  const keyName = `${prefix}slaps:songs`;
  console.log(`Fetching songs from KV key: ${keyName}...`);
  
  const rawList = await kvFetch(['LRANGE', keyName, 0, -1]);
  if (!rawList || !Array.isArray(rawList)) {
    console.error("Failed to retrieve songs list.");
    return;
  }
  
  const targetSet = new Set(TARGET_IDS);
  const baseTime = new Date("2026-06-07T12:10:00Z").getTime();
  
  let updatedCount = 0;
  const updatedList = rawList.map(item => {
    try {
      const song = JSON.parse(item);
      if (song && targetSet.has(song.youtube_id)) {
        // 対象の12曲の created_at を、リスト内の順序（追加された順）に応じて 2026-06-07 の最新日時に変更
        // 逆順（LPUSHで先頭にあるものほど最新になるようにする）
        const indexInTargets = TARGET_IDS.indexOf(song.youtube_id);
        // インデックスが 0 のもの (Doechii) が最も未来 (最新) になるように 12-index 秒引く
        const updatedTime = new Date(baseTime + (12 - indexInTargets) * 1000).toISOString();
        song.created_at = updatedTime;
        if (song.publish_at) song.publish_at = updatedTime;
        updatedCount++;
      }
      return JSON.stringify(song);
    } catch (e) {
      return item;
    }
  });

  console.log(`Updated ${updatedCount} songs in KV list representation.`);

  if (updatedCount > 0) {
    console.log("Deleting old key...");
    await kvFetch(['DEL', keyName]);
    
    console.log("Writing updated songs back to KV using RPUSH...");
    const chunkSize = 50;
    for (let i = 0; i < updatedList.length; i += chunkSize) {
      const chunk = updatedList.slice(i, i + chunkSize);
      await kvFetch(['RPUSH', keyName, ...chunk]);
    }
  }

  // ローカルの songs.json も同様に更新
  console.log("Updating local songs.json...");
  if (fs.existsSync(songsJsonPath)) {
    const localSongs = JSON.parse(fs.readFileSync(songsJsonPath, 'utf8'));
    let localUpdated = 0;
    const newLocalSongs = localSongs.map(song => {
      if (song && targetSet.has(song.youtube_id)) {
        const indexInTargets = TARGET_IDS.indexOf(song.youtube_id);
        const updatedTime = new Date(baseTime + (12 - indexInTargets) * 1000).toISOString();
        song.created_at = updatedTime;
        if (song.publish_at) song.publish_at = updatedTime;
        localUpdated++;
      }
      return song;
    });
    fs.writeFileSync(songsJsonPath, JSON.stringify(newLocalSongs, null, 2), 'utf8');
    console.log(`Updated ${localUpdated} songs in local songs.json.`);
  }

  console.log("All updates completed successfully!");
}

run().catch(err => {
  console.error("Execution failed:", err);
  process.exit(1);
});
