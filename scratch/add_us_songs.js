const fs = require('fs');
const path = require('path');

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const prefix = process.env.DB_PREFIX || '';
const songsJsonPath = path.join(__dirname, '../data/songs.json');

const YOUTUBE_IDS = [
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

// oEmbedからタイトル取得
async function getSongTitle(id) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.title;
  } catch (e) {
    return null;
  }
}

// Watchページから公開日取得
async function getPublishDate(id) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}`);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"publishDate":"([^"]+)"/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

function parseEra(dateStr) {
  if (!dateStr) return "20s"; // デフォルト
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (year >= 1990 && year <= 1999) return "90s";
  if (year >= 2000 && year <= 2009) return "00s";
  if (year >= 2010 && year <= 2019) return "10s";
  if (year >= 2020) return "20s";
  return "20s";
}

async function run() {
  console.log("Loading existing songs from local file...");
  let localSongs = [];
  if (fs.existsSync(songsJsonPath)) {
    localSongs = JSON.parse(fs.readFileSync(songsJsonPath, 'utf8'));
  }
  const localIds = new Set(localSongs.map(s => s.youtube_id));

  console.log("Checking duplicates against KV...");
  const songsKey = `${prefix}slaps:songs`;
  const idsKey = `${prefix}slaps:existing_ids`;
  
  const kvIdsList = await kvFetch(['SMEMBERS', idsKey]) || [];
  const kvIds = new Set(kvIdsList);

  const songsToAdd = [];
  
  for (const id of YOUTUBE_IDS) {
    console.log(`Processing ID: ${id}...`);
    if (kvIds.has(id)) {
      console.log(`-> Skipped: ${id} already exists in KV.`);
      continue;
    }

    const title = await getSongTitle(id);
    if (!title) {
      console.warn(`-> Failed to get title for ${id}. Skipping.`);
      continue;
    }

    const publishDate = await getPublishDate(id);
    const era = parseEra(publishDate);
    const nowStr = new Date().toISOString();

    const newSong = {
      youtube_id: id,
      name: title,
      description: {
        ja: "",
        en: ""
      },
      user_name: "青木 喬 takashi aoki",
      region: "us",
      era: era,
      conscious_turnt: 2.5,
      thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
      created_at: publishDate || nowStr
    };

    songsToAdd.push(newSong);
    console.log(`-> Prepared: "${title}" (${era})`);
  }

  if (songsToAdd.length === 0) {
    console.log("No new songs to add.");
    return;
  }

  console.log(`\nAdding ${songsToAdd.length} songs...`);

  // Local JSON write (bypassed since already written)
  // console.log("Updating local songs.json...");
  // localSongs.push(...songsToAdd);
  // fs.writeFileSync(songsJsonPath, JSON.stringify(localSongs, null, 2), 'utf8');

  // KV write
  console.log("Updating Vercel KV Database...");
  for (const song of songsToAdd) {
    // LPUSH to songs list
    await kvFetch(['LPUSH', songsKey, JSON.stringify(song)]);
    // SADD to existing ids set
    await kvFetch(['SADD', idsKey, song.youtube_id]);
    console.log(`-> Added to KV: ${song.name}`);
  }

  console.log("\nAll songs added successfully!");
}

run().catch(err => {
  console.error("Execution failed:", err);
  process.exit(1);
});
