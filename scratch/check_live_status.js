const fs = require('fs');
const path = require('path');

// 削除対象の7曲のID
const EXCLUDE_IDS = new Set([
  'QLEc84xQRQM', // 女王蜂
  'AaMmSNBt_O8', // KID PHENOMENON
  'iR5vQeUQ32Q', // ShowMinorSavage
  '0izBEKMf-3Q', // Number_i
  'JPQqPJqY_Lo', // Number_i
  'IoDViKwXqjw', // Number_i
  'Zv6JKobJyFY'  // BTS
]);

const unifiedPath = path.join(__dirname, 'all_songs_unified.json');
if (!fs.existsSync(unifiedPath)) {
  console.error("Unified songs JSON not found. Please run extract_and_backup.js first.");
  process.exit(1);
}

const songs = JSON.parse(fs.readFileSync(unifiedPath, 'utf8'));

// oembed チェック
async function checkYoutubeOEmbed(youtubeId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
  try {
    const res = await fetch(url);
    if (res.status === 404 || res.status === 400 || res.status === 401 || res.status === 403) {
      return { valid: false, status: res.status };
    }
    return { valid: true, status: res.status };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// YouTube 検索
async function searchYouTube(query, oldId) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) return null;
    const html = await response.text();
    
    // Extract video IDs
    const regex = /"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/g;
    let match;
    const candidates = [];
    while ((match = regex.exec(html)) !== null) {
      const id = match[1];
      if (id !== oldId && !candidates.includes(id)) {
        candidates.push(id);
      }
      if (candidates.length >= 10) break;
    }
    
    const watchRegex = /\/watch\?v=([A-Za-z0-9_-]{11})/g;
    while ((match = watchRegex.exec(html)) !== null) {
      const id = match[1];
      if (id !== oldId && !candidates.includes(id)) {
        candidates.push(id);
      }
      if (candidates.length >= 20) break;
    }
    
    return candidates;
  } catch (e) {
    return null;
  }
}

// 並行処理のためのバッチユーティリティ
async function runBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`Checking batch ${i / batchSize + 1}/${Math.ceil(items.length / batchSize)} (items ${i} to ${i + batch.length - 1})...`);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    // サーバーやAPIへの過負荷を避けるため、バッチ間に少しスリープを入れる
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return results;
}

async function run() {
  // すでに削除指示の出たものは除外してチェック
  const activeSongs = songs.filter(s => !EXCLUDE_IDS.has(s.youtube_id));
  console.log(`Starting live status check for ${activeSongs.length} active songs...`);

  const checkResults = await runBatches(activeSongs, 15, async (song) => {
    const oembed = await checkYoutubeOEmbed(song.youtube_id);
    return {
      song,
      valid: oembed.valid,
      status: oembed.status || null,
      error: oembed.error || null
    };
  });

  const broken = checkResults.filter(r => !r.valid);
  console.log(`Found ${broken.length} broken songs. Searching alternatives...`);

  const report = [];

  for (let i = 0; i < broken.length; i++) {
    const item = broken[i];
    const song = item.song;
    console.log(`[${i + 1}/${broken.length}] Searching alternative for: "${song.name}" (ID: ${song.youtube_id}, Status: ${item.status || item.error})`);
    
    // 曲名から検索キーワードを作成
    // "Artist - Title" の形式をパース
    let query = song.name;
    const candidates = await searchYouTube(query, song.youtube_id);
    
    let alternative = null;
    if (candidates && candidates.length > 0) {
      for (const candId of candidates) {
        const verify = await checkYoutubeOEmbed(candId);
        if (verify.valid) {
          alternative = candId;
          break;
        }
      }
    }

    report.push({
      youtube_id: song.youtube_id,
      name: song.name,
      status: item.status || 'ERROR',
      alternative_id: alternative
    });
    
    // YouTube検索の頻度を抑える
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const reportPath = path.join(__dirname, 'broken_songs_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Broken songs report written to: ${reportPath}`);
}

run().catch(console.error);
