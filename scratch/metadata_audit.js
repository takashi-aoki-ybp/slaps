const fs = require('fs');
const path = require('path');

// 削除対象の7曲のID (監査対象外とする)
const EXCLUDE_IDS = new Set([
  'QLEc84xQRQM', // 女王蜂
  'AaMmSNBt_O8', // KID PHENOMENON
  'iR5vQeUQ32Q', // ShowMinorSavage
  '0izBEKMf-3Q', // Number_i
  'JPQqPJqY_Lo', // Number_i
  'IoDViKwXqjw', // Number_i
  'Zv6JKobJyFY'  // BTS
]);

// 環境変数のロード
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.prod.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      if (line && line.trim() && !line.startsWith('#') && line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        process.env[key.trim()] = value;
      }
    }
  }
}
loadEnv();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY is not defined in .env.prod.local");
  process.exit(1);
}

const unifiedPath = path.join(__dirname, 'all_songs_unified.json');
if (!fs.existsSync(unifiedPath)) {
  console.error("Error: all_songs_unified.json not found.");
  process.exit(1);
}

const songs = JSON.parse(fs.readFileSync(unifiedPath, 'utf8'));

// Gemini API の呼び出し
async function callGemini(tracks) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const prompt = `Analyze the following list of music tracks (from a Hip-hop station app) and determine their correct country/region, era, and whether they are completely non-hiphop.

Definitions:
1. Region (the artist's primary nationality or style origin):
- 'us': United States
- 'jp': Japan
- 'uk': United Kingdom
- 'fr': France
- 'kr': South Korea
- 'other': Other countries

2. Era (when the song was originally released as a single or on an album):
- '90s': 1990 - 1999
- '00s': 2000 - 2009
- '10s': 2010 - 2019
- '20s+': 2020 or later

3. Non-Hiphop (is this track fundamentally NOT hip-hop?):
- Set non_hiphop to true if it has NO hip-hop/rap elements (e.g., pure J-Pop, K-Pop idols with zero hip-hop production, pure rock, classic folk, R&B without any rap/hip-hop elements).
- Set non_hiphop to false if it is hip-hop, trap, boom-bap, rap, or R&B heavily featuring rap/hip-hop production.

Tracks to analyze:
${JSON.stringify(tracks, null, 2)}`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            youtube_id: { type: "STRING" },
            region: { type: "STRING", enum: ["us", "jp", "uk", "fr", "kr", "other"] },
            era: { type: "STRING", enum: ["90s", "00s", "10s", "20s+"] },
            non_hiphop: { type: "BOOLEAN" },
            confidence: { type: "NUMBER" },
            reason: { type: "STRING", description: "Brief explanation of findings" }
          },
          required: ["youtube_id", "region", "era", "non_hiphop", "confidence"]
        }
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  } else {
    throw new Error("Invalid response format from Gemini API");
  }
}

async function callGeminiWithRetry(tracks, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await callGemini(tracks);
    } catch (err) {
      console.warn(`[Attempt ${attempt}/${retries}] Failed to analyze batch: ${err.message}`);
      if (attempt === retries) throw err;
      const sleepTime = attempt * 15000;
      console.log(`Sleeping for ${sleepTime}ms before retrying...`);
      await new Promise(resolve => setTimeout(resolve, sleepTime));
    }
  }
}

async function run() {
  // 削除対象の7曲を除外
  const activeSongs = songs.filter(s => !EXCLUDE_IDS.has(s.youtube_id));
  console.log(`Total songs in unified database: ${songs.length}`);
  console.log(`Active songs to audit (excluding 7 deleted ones): ${activeSongs.length}`);

  // summer 投稿曲のリストアップ
  const summerSongs = songs.filter(s => s.user_name === 'summer');
  console.log(`Found ${summerSongs.length} songs posted by 'summer'.`);

  // バッチサイズ 80 で処理 (RPMを回避するため大きめのバッチにし、リクエスト回数を抑える)
  const BATCH_SIZE = 80;
  const auditResults = [];
  const start = Date.now();

  for (let i = 0; i < activeSongs.length; i += BATCH_SIZE) {
    const batch = activeSongs.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(activeSongs.length / BATCH_SIZE);
    
    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} tracks)...`);

    // APIに送る簡易データ
    const tracksToSend = batch.map(s => ({
      youtube_id: s.youtube_id,
      name: s.name
    }));

    try {
      const results = await callGeminiWithRetry(tracksToSend);
      auditResults.push(...results);
      console.log(`Batch ${batchNum} successfully processed.`);
    } catch (err) {
      console.error(`Fatal error processing batch ${batchNum}: ${err.message}`);
      // エラーが起きた場合は、元の設定をそのまま結果として補完してクラッシュを防ぐ
      for (const track of batch) {
        auditResults.push({
          youtube_id: track.youtube_id,
          region: track.region,
          era: track.era === '20s' ? '20s+' : track.era,
          non_hiphop: false,
          confidence: 0,
          reason: `Failed to analyze: ${err.message}`
        });
      }
    }

    // RPM 制限を回避するため、十分なウェイト (15秒) を設ける
    await new Promise(resolve => setTimeout(resolve, 15000));
  }

  // 監査結果と元のデータを比較して差異をレポート
  let modifiedRegionCount = 0;
  let modifiedEraCount = 0;
  let nonHiphopCount = 0;

  const finalResults = [];

  for (const song of activeSongs) {
    const audited = auditResults.find(r => r.youtube_id === song.youtube_id);
    if (!audited) {
      finalResults.push({
        youtube_id: song.youtube_id,
        name: song.name,
        original: { region: song.region, era: song.region },
        audited: { region: song.region, era: song.era === '20s' ? '20s+' : song.era, non_hiphop: false, confidence: 0, reason: "No audited data" },
        action_needed: { region: false, era: false, non_hiphop: false }
      });
      continue;
    }

    // era '20s' と '20s+' は同等とみなす
    const originalEraMapped = song.era === '20s' ? '20s+' : song.era;
    const regionChanged = song.region !== audited.region;
    const eraChanged = originalEraMapped !== audited.era;
    const isNonHiphop = audited.non_hiphop;

    if (regionChanged) modifiedRegionCount++;
    if (eraChanged) modifiedEraCount++;
    if (isNonHiphop) nonHiphopCount++;

    finalResults.push({
      youtube_id: song.youtube_id,
      name: song.name,
      original: {
        region: song.region,
        era: song.era
      },
      audited: {
        region: audited.region,
        era: audited.era,
        non_hiphop: audited.non_hiphop,
        confidence: audited.confidence,
        reason: audited.reason
      },
      action_needed: {
        region: regionChanged,
        era: eraChanged,
        non_hiphop: isNonHiphop
      }
    });
  }

  const report = {
    summary: {
      total_songs: songs.length,
      total_active_processed: activeSongs.length,
      modified_region_count: modifiedRegionCount,
      modified_era_count: modifiedEraCount,
      non_hiphop_count: nonHiphopCount,
      summer_songs_count: summerSongs.length,
      elapsed_seconds: Math.floor((Date.now() - start) / 1000)
    },
    summer_songs: summerSongs.map(s => ({
      youtube_id: s.youtube_id,
      name: s.name,
      region: s.region,
      era: s.era
    })),
    audit_results: finalResults
  };

  const reportPath = path.join(__dirname, 'audit_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nAudit completed! Report written to: ${reportPath}`);
  console.log(`Summary:`);
  console.log(`- Modified Regions: ${modifiedRegionCount}`);
  console.log(`- Modified Eras: ${modifiedEraCount}`);
  console.log(`- Non-Hiphop Songs: ${nonHiphopCount}`);
}

run().catch(console.error);
