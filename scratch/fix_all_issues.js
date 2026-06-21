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
  const songsPath = path.join(__dirname, '../data/songs.json');
  let songs = JSON.parse(fs.readFileSync(songsPath, 'utf8'));
  console.log(`Loaded ${songs.length} songs from local.`);

  // === A. ローカル修正 ===

  // A1. 重複ZORNテストエントリを削除（youtube_id=tOS-Yx4Qb_M で description.ja=空値テスト のもの）
  const beforeLen = songs.length;
  songs = songs.filter(s => !(s.youtube_id === 'tOS-Yx4Qb_M' && s.description && s.description.ja === '空値テスト'));
  console.log(`Removed test ZORN duplicate: ${beforeLen - songs.length} entries removed`);

  // A2. KVのみの3曲を追加（説明文付き）
  const newSongs = [
    {
      youtube_id: 'dbbRrNHJ4Lg',
      name: 'Common - Come Close (Official Music Video) ft. Mary J. Blige',
      description: {
        en: "Common & Mary J. Blige — soulful hip-hop love letter",
        ja: "CommonとMary J. Bligeの極上ソウルフルHIPHOPラブソング"
      },
      region: 'us',
      era: '00s',
      user_name: '青木 喬 takashi aoki',
      thumbnail: 'https://img.youtube.com/vi/dbbRrNHJ4Lg/mqdefault.jpg',
      conscious_turnt: 1.5,
      created_at: '2026-06-17T01:50:27.070Z'
    },
    {
      youtube_id: '0gG1UFrnGsE',
      name: 'ScHoolboy Q - Yeern 101 (Official Music Video)',
      description: {
        en: "ScHoolboy Q — raw Hoover Street energy",
        ja: "ScHoolboy Qのストリート全開な一曲"
      },
      region: 'us',
      era: '20s',
      user_name: 'takashi aoki',
      thumbnail: 'https://img.youtube.com/vi/0gG1UFrnGsE/mqdefault.jpg',
      conscious_turnt: 3.5,
      created_at: '2026-06-15T12:47:21.755Z'
    },
    {
      youtube_id: 'tWo1NrwYdCs',
      name: 'Chance The Rapper - I Got You (Always and Forever) [ft. En Vogue, Ari Lennox and Kierra Sheard]',
      description: {
        en: "Chance x En Vogue x Ari Lennox — uplifting gospel-infused feel-good anthem",
        ja: "Chance The Rapperとレジェンドたちによるゴスペル感溢れるフィールグッドアンセム"
      },
      region: 'us',
      era: '20s',
      user_name: '青木 喬 Takashi Aoki',
      thumbnail: 'https://img.youtube.com/vi/tWo1NrwYdCs/mqdefault.jpg',
      conscious_turnt: 2,
      created_at: '2026-06-15T12:16:17.204Z'
    }
  ];

  for (const ns of newSongs) {
    if (!songs.find(s => s.youtube_id === ns.youtube_id)) {
      songs.push(ns);
      console.log(`Added: ${ns.name}`);
    } else {
      console.log(`Already exists locally: ${ns.name}`);
    }
  }

  // A3. Save local songs.json
  fs.writeFileSync(songsPath, JSON.stringify(songs, null, 2) + '\n');
  console.log(`Saved local songs.json: ${songs.length} songs`);

  // A4. Copy to www/data/songs.json
  const wwwSongsPath = path.join(__dirname, '../www/data/songs.json');
  fs.writeFileSync(wwwSongsPath, JSON.stringify(songs, null, 2) + '\n');
  console.log(`Saved www/data/songs.json: ${songs.length} songs`);

  // === B. KV修正 ===
  console.log('\n=== KV FIXES ===');

  // Fetch current KV data
  const songsKey = `${prefix}slaps:songs`;
  const rawList = await kvFetch(['LRANGE', songsKey, 0, -1]);
  let kvSongs = rawList.map(item => JSON.parse(item));
  console.log(`Fetched ${kvSongs.length} songs from KV`);

  let kvModified = false;

  // B1. Fix region for CA7RIEL x3, Falz, Kwesi Arthur (us → other)
  const regionFixIds = ['T15S4RnJYMc', 'klMGDp6eeow', '6wyVVWIZojw', 'CdvY-tfI3ME', 'QLg8lPWnuHk'];
  for (const id of regionFixIds) {
    const kvSong = kvSongs.find(s => s.youtube_id === id);
    if (kvSong && kvSong.region === 'us') {
      kvSong.region = 'other';
      console.log(`KV region fix: ${kvSong.name} → other`);
      kvModified = true;
    }
  }

  // B2. Fix Common - Come Close era (KV has 20s, should be 00s since the song is from 2002)
  const commonSong = kvSongs.find(s => s.youtube_id === 'dbbRrNHJ4Lg');
  if (commonSong && commonSong.era === '20s') {
    commonSong.era = '00s';
    console.log(`KV era fix: Common - Come Close → 00s`);
    kvModified = true;
  }

  // B3. Add descriptions to the 3 KV-only songs
  for (const ns of newSongs) {
    const kvSong = kvSongs.find(s => s.youtube_id === ns.youtube_id);
    if (kvSong) {
      kvSong.description = ns.description;
      if (ns.youtube_id === 'dbbRrNHJ4Lg') kvSong.era = ns.era;
      if (ns.conscious_turnt) kvSong.conscious_turnt = ns.conscious_turnt;
      console.log(`KV desc added: ${kvSong.name}`);
      kvModified = true;
    }
  }

  // B4. Remove duplicate ZORN test entry from KV if exists
  const zornDupes = kvSongs.filter(s => s.youtube_id === 'tOS-Yx4Qb_M');
  if (zornDupes.length > 1) {
    // Keep the one with proper description, remove the test one
    kvSongs = kvSongs.filter(s => !(s.youtube_id === 'tOS-Yx4Qb_M' && s.description && s.description.ja === '空値テスト'));
    console.log(`KV removed test ZORN duplicate`);
    kvModified = true;
  }

  // B5. Write back to KV
  if (kvModified) {
    console.log('\nWriting corrected data back to KV...');
    // Clear and re-push
    await kvFetch(['DEL', songsKey]);
    console.log('Cleared KV songs list');

    // Push in batches of 50
    const batchSize = 50;
    for (let i = 0; i < kvSongs.length; i += batchSize) {
      const batch = kvSongs.slice(i, i + batchSize);
      const args = [songsKey, ...batch.map(s => JSON.stringify(s))];
      await kvFetch(['RPUSH', ...args]);
      console.log(`Pushed batch ${Math.floor(i/batchSize)+1}/${Math.ceil(kvSongs.length/batchSize)}`);
    }
    console.log(`KV updated: ${kvSongs.length} songs total`);
  } else {
    console.log('No KV modifications needed.');
  }

  // === C. Verify ===
  console.log('\n=== VERIFICATION ===');
  const verifyRaw = await kvFetch(['LRANGE', songsKey, 0, -1]);
  const verifySongs = verifyRaw.map(item => JSON.parse(item));
  console.log(`KV songs after update: ${verifySongs.length}`);

  // Verify region fixes
  for (const id of regionFixIds) {
    const s = verifySongs.find(v => v.youtube_id === id);
    console.log(`  ${s.name}: region=${s.region} ✓`);
  }

  // Verify new songs have descriptions
  for (const ns of newSongs) {
    const s = verifySongs.find(v => v.youtube_id === ns.youtube_id);
    if (s) {
      const descJa = typeof s.description === 'object' ? s.description.ja : s.description;
      console.log(`  ${s.name}: desc_ja="${descJa}" ✓`);
    }
  }

  // Verify no ZORN duplicates
  const zornCount = verifySongs.filter(s => s.youtube_id === 'tOS-Yx4Qb_M').length;
  console.log(`  ZORN entries: ${zornCount} (should be 1) ${zornCount === 1 ? '✓' : '✗'}`);

  // Local vs KV count
  const localFinal = JSON.parse(fs.readFileSync(songsPath, 'utf8'));
  console.log(`\nFinal counts: Local=${localFinal.length}, KV=${verifySongs.length}`);
}

run().catch(console.error);
