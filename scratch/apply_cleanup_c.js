const fs = require('fs');
const path = require('path');

// 1. 環境変数のロード
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
  console.error("Error: Missing KV URL or Token in environment variables.");
  process.exit(1);
}

// 2. 削除対象の楽曲IDリスト（追加削除3曲、ダミー曲を含む）
const EXCLUDE_IDS = new Set([
  // ユーザー指定 7曲
  'QLEc84xQRQM', // 女王蜂
  'AaMmSNBt_O8', // KID PHENOMENON
  'iR5vQeUQ32Q', // ShowMinorSavage
  '0izBEKMf-3Q', // Number_i - LAVALAVA
  'JPQqPJqY_Lo', // Number_i - ATAMI
  'IoDViKwXqjw', // Number_i - i-mode
  'Zv6JKobJyFY', // BTS - Hooligan
  
  // 追加削除 3曲 (posted by summer の中から指定)
  '1Wl1B7DPegc', // The 1975 - Love It If We Made It
  'kdvce-9H_HU', // Novel Core, SHUNTO, RYOKI / MF
  '-XpAW0jXA10', // KUROMI「KUROMI♡Profile」
  
  // ダミーデータ・テスト曲
  'A1B2C3D4E5J',
  'A1B2C3D4E5I',
  'A1B2C3D4E5H',
  'A1B2C3D4E5G',
  '3S1tP7S-uLg',
  '3tmd-ClpJKA'  // Test Song
]);

// 3. 動画IDの置換リスト（再生不能のZORNの代替）
const REPLACE_IDS = {
  '8V94XvDq_m8': 'tOS-Yx4Qb_M' // ZORN - Walk This Way
};

// 4. 国・年代のメタデータ是正マッピング
const METADATA_CORRECTIONS = {
  'T15S4RnJYMc': { region: 'other' }, // CA7RIEL & Paco Amoroso
  'klMGDp6eeow': { region: 'other' }, // CA7RIEL & Paco Amoroso
  '6wyVVWIZojw': { region: 'other' }, // CA7RIEL & Paco Amoroso
  '1Vf4mMCpNY0': { region: 'us' },    // Lil Wayne - A Milli (jp➔us)
  'KrkZOLj26TE': { region: 'jp' },    // LANA - Diamonds in the Sky (fr➔jp)
  'CdvY-tfI3ME': { region: 'other' }, // Falz - This Is Nigeria (us➔other)
  'QLg8lPWnuHk': { region: 'other' }, // Kwesi Arthur (us➔other)
  'Edthfw5Pbxk': { era: '10s' }       // Yves Tumor - Noid (20s➔10s)
};

// Vercel KV API 呼び出し関数
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
  const unifiedPath = path.join(__dirname, 'all_songs_unified.json');
  if (!fs.existsSync(unifiedPath)) {
    console.error("Error: all_songs_unified.json not found.");
    process.exit(1);
  }

  const songs = JSON.parse(fs.readFileSync(unifiedPath, 'utf8'));
  console.log(`Original songs count: ${songs.length}`);

  const cleanedSongs = [];

  for (const song of songs) {
    const originalId = song.youtube_id;
    
    // 削除対象はスキップ
    if (EXCLUDE_IDS.has(originalId)) {
      console.log(`- Deleting song: "${song.name}" (ID: ${originalId})`);
      continue;
    }

    const newSong = { ...song };

    // 動画IDの置換（デッドリンク差し替え）
    if (REPLACE_IDS[originalId]) {
      const newId = REPLACE_IDS[originalId];
      console.log(`- Replacing video ID for: "${song.name}" (${originalId} -> ${newId})`);
      newSong.youtube_id = newId;
      newSong.thumbnail = `https://img.youtube.com/vi/${newId}/mqdefault.jpg`;
    }

    // メタデータの是正
    const correctionId = REPLACE_IDS[originalId] || originalId;
    if (METADATA_CORRECTIONS[correctionId]) {
      const corr = METADATA_CORRECTIONS[correctionId];
      for (const [key, val] of Object.entries(corr)) {
        console.log(`- Correcting metadata for: "${song.name}" (${key}: ${newSong[key]} -> ${val})`);
        newSong[key] = val;
      }
    }

    // 表記のゆれ調整: era '20s+' や '20s' を UI コードに合わせ '20s' に統一
    if (newSong.era === '20s+' || newSong.era === '20s') {
      newSong.era = '20s';
    }

    cleanedSongs.push(newSong);
  }

  console.log(`\nCleaned songs count: ${cleanedSongs.length}`);

  // --- ローカルファイルの更新 ---
  const localSongsPath = path.join(__dirname, '../data/songs.json');
  fs.writeFileSync(localSongsPath, JSON.stringify(cleanedSongs, null, 2), 'utf8');
  console.log(`1. Local file updated at: ${localSongsPath}`);

  // --- Vercel KV の更新 ---
  const songsKey = `${prefix}slaps:songs`;
  const existingKey = `${prefix}slaps:existing_ids`;
  const brokenKey = `${prefix}slaps:broken`;

  console.log("2. Updating Vercel KV...");

  // ① songs リストの更新 (一旦削除して RPUSH)
  console.log("  - Deleting old songs list in KV...");
  await kvFetch(['DEL', songsKey]);
  
  console.log("  - Pushing new songs list in chunks...");
  const chunkSize = 50;
  for (let i = 0; i < cleanedSongs.length; i += chunkSize) {
    const chunk = cleanedSongs.slice(i, i + chunkSize).map(s => JSON.stringify(s));
    await kvFetch(['RPUSH', songsKey, ...chunk]);
  }
  console.log("  -> Songs list synced successfully.");

  // ② existing_ids の更新
  console.log("  - Syncing existing_ids set/hash...");
  const existingType = await kvFetch(['TYPE', existingKey]);
  console.log(`  -> existing_ids type in KV: ${existingType}`);

  if (existingType === 'set') {
    // 削除対象を除外
    for (const id of EXCLUDE_IDS) {
      await kvFetch(['SREM', existingKey, id]);
    }
    // 差し替え元を除外
    for (const oldId of Object.keys(REPLACE_IDS)) {
      await kvFetch(['SREM', existingKey, oldId]);
    }
    // 差し替え先を追加
    for (const newId of Object.values(REPLACE_IDS)) {
      await kvFetch(['SADD', existingKey, newId]);
    }
  } else if (existingType === 'hash') {
    // 削除対象を除外
    for (const id of EXCLUDE_IDS) {
      await kvFetch(['HDEL', existingKey, id]);
    }
    // 差し替え元を除外
    for (const oldId of Object.keys(REPLACE_IDS)) {
      await kvFetch(['HDEL', existingKey, oldId]);
    }
    // 差し替え先を追加
    for (const newId of Object.values(REPLACE_IDS)) {
      await kvFetch(['HSET', existingKey, newId, '1']);
    }
  }
  console.log("  -> existing_ids updated successfully.");

  // ③ broken ハッシュのクリーンアップ
  console.log("  - Cleaning up broken videos list...");
  // 削除された動画と差し替えられた動画は broken から削除
  for (const id of EXCLUDE_IDS) {
    await kvFetch(['HDEL', brokenKey, id]);
  }
  for (const oldId of Object.keys(REPLACE_IDS)) {
    await kvFetch(['HDEL', brokenKey, oldId]);
  }
  for (const newId of Object.values(REPLACE_IDS)) {
    await kvFetch(['HDEL', brokenKey, newId]);
  }
  console.log("  -> broken list cleaned up successfully.");

  console.log("\nDATABASE CLEANUP AND APPLICATION COMPLETED SUCCESSFULLY.");
}

run().catch(console.error);
