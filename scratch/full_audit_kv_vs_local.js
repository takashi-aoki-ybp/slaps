const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '../.env.prod.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?s*$/);
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
const prefix = 'prod:';

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
  // 1. Load local songs.json
  const localSongsPath = path.join(__dirname, '../data/songs.json');
  const localSongs = JSON.parse(fs.readFileSync(localSongsPath, 'utf8'));
  console.log(`Local songs.json: ${localSongs.length} songs`);

  // Build local lookup by youtube_id
  const localMap = new Map();
  for (const s of localSongs) {
    localMap.set(s.youtube_id, s);
  }

  // 2. Fetch ALL songs from prod KV
  const songsKey = `${prefix}slaps:songs`;
  console.log(`Fetching from KV key: ${songsKey}`);
  const rawList = await kvFetch(['LRANGE', songsKey, 0, -1]);
  if (!rawList || !Array.isArray(rawList)) {
    console.log("No songs found in prod KV.");
    return;
  }
  console.log(`Prod KV: ${rawList.length} songs`);

  const kvSongs = rawList.map(item => JSON.parse(item));

  // Build KV lookup by youtube_id
  const kvMap = new Map();
  for (const s of kvSongs) {
    kvMap.set(s.youtube_id, s);
  }

  // 3. Compare
  const issues = [];

  // 3a. Songs in KV but NOT in local
  const inKvNotLocal = [];
  for (const kvSong of kvSongs) {
    if (!localMap.has(kvSong.youtube_id)) {
      inKvNotLocal.push({
        youtube_id: kvSong.youtube_id,
        name: kvSong.name,
        description: kvSong.description,
      });
    }
  }

  // 3b. Songs in local but NOT in KV
  const inLocalNotKv = [];
  for (const localSong of localSongs) {
    if (!kvMap.has(localSong.youtube_id)) {
      inLocalNotKv.push({
        youtube_id: localSong.youtube_id,
        name: localSong.name,
        description: localSong.description,
      });
    }
  }

  // 3c. Songs in BOTH but description mismatch
  const descMismatch = [];
  for (const kvSong of kvSongs) {
    const localSong = localMap.get(kvSong.youtube_id);
    if (!localSong) continue;

    const kvDescJa = typeof kvSong.description === 'object' ? kvSong.description.ja : kvSong.description;
    const localDescJa = typeof localSong.description === 'object' ? localSong.description.ja : localSong.description;
    const kvDescEn = typeof kvSong.description === 'object' ? kvSong.description.en : '';
    const localDescEn = typeof localSong.description === 'object' ? localSong.description.en : '';

    if (kvDescJa !== localDescJa || kvDescEn !== localDescEn) {
      descMismatch.push({
        youtube_id: kvSong.youtube_id,
        name: kvSong.name,
        kv_desc_ja: kvDescJa,
        local_desc_ja: localDescJa,
        kv_desc_en: kvDescEn,
        local_desc_en: localDescEn,
      });
    }
  }

  // 3d. Songs in BOTH but name mismatch
  const nameMismatch = [];
  for (const kvSong of kvSongs) {
    const localSong = localMap.get(kvSong.youtube_id);
    if (!localSong) continue;
    if (kvSong.name !== localSong.name) {
      nameMismatch.push({
        youtube_id: kvSong.youtube_id,
        kv_name: kvSong.name,
        local_name: localSong.name,
      });
    }
  }

  // 3e. Songs in BOTH but region/era/conscious_turnt mismatch
  const metaMismatch = [];
  for (const kvSong of kvSongs) {
    const localSong = localMap.get(kvSong.youtube_id);
    if (!localSong) continue;
    const diffs = [];
    if (kvSong.region !== localSong.region) diffs.push(`region: KV=${kvSong.region} LOCAL=${localSong.region}`);
    if (kvSong.era !== localSong.era) diffs.push(`era: KV=${kvSong.era} LOCAL=${localSong.era}`);
    if (kvSong.conscious_turnt !== localSong.conscious_turnt) diffs.push(`conscious_turnt: KV=${kvSong.conscious_turnt} LOCAL=${localSong.conscious_turnt}`);
    if (diffs.length > 0) {
      metaMismatch.push({
        youtube_id: kvSong.youtube_id,
        name: kvSong.name,
        diffs,
      });
    }
  }

  // Output report
  const report = {
    summary: {
      local_count: localSongs.length,
      kv_count: kvSongs.length,
      in_kv_not_local: inKvNotLocal.length,
      in_local_not_kv: inLocalNotKv.length,
      description_mismatch: descMismatch.length,
      name_mismatch: nameMismatch.length,
      metadata_mismatch: metaMismatch.length,
    },
    in_kv_not_local: inKvNotLocal,
    in_local_not_kv: inLocalNotKv,
    description_mismatch: descMismatch,
    name_mismatch: nameMismatch,
    metadata_mismatch: metaMismatch,
  };

  const reportPath = path.join(__dirname, 'full_audit_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ${reportPath}`);
  console.log(`\n=== SUMMARY ===`);
  console.log(`Local songs:           ${report.summary.local_count}`);
  console.log(`KV songs:              ${report.summary.kv_count}`);
  console.log(`In KV but NOT local:   ${report.summary.in_kv_not_local}`);
  console.log(`In local but NOT KV:   ${report.summary.in_local_not_kv}`);
  console.log(`Description mismatch:  ${report.summary.description_mismatch}`);
  console.log(`Name mismatch:         ${report.summary.name_mismatch}`);
  console.log(`Metadata mismatch:     ${report.summary.metadata_mismatch}`);

  // Print specific detail for critical items
  if (inKvNotLocal.length > 0) {
    console.log(`\n=== IN KV BUT NOT LOCAL (${inKvNotLocal.length}) ===`);
    for (const s of inKvNotLocal) {
      console.log(`  ${s.youtube_id} | ${s.name}`);
    }
  }
  if (descMismatch.length > 0) {
    console.log(`\n=== DESCRIPTION MISMATCH (${descMismatch.length}) ===`);
    for (const s of descMismatch) {
      console.log(`  ${s.youtube_id} | ${s.name}`);
      console.log(`    KV ja:    ${s.kv_desc_ja}`);
      console.log(`    Local ja: ${s.local_desc_ja}`);
      if (s.kv_desc_en !== s.local_desc_en) {
        console.log(`    KV en:    ${s.kv_desc_en}`);
        console.log(`    Local en: ${s.local_desc_en}`);
      }
    }
  }
  if (nameMismatch.length > 0) {
    console.log(`\n=== NAME MISMATCH (${nameMismatch.length}) ===`);
    for (const s of nameMismatch) {
      console.log(`  ${s.youtube_id}`);
      console.log(`    KV:    ${s.kv_name}`);
      console.log(`    Local: ${s.local_name}`);
    }
  }
}

run().catch(console.error);
