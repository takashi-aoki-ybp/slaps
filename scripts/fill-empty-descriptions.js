const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const songsPath = path.join(root, 'data', 'songs.json');
const songs = JSON.parse(fs.readFileSync(songsPath, 'utf8'));
const targets = songs.filter(song =>
  !(song.description?.ja || '').trim() && !(song.description?.en || '').trim());

const regionLabels = {
  us: ['US', 'US'],
  jp: ['日本', 'Japan'],
  uk: ['UK', 'the UK'],
  fr: ['フランス', 'France'],
  kr: ['韓国', 'Korea'],
  other: ['グローバル', 'the global scene'],
};

const eraLabels = {
  '90s': ['1990年代', 'the 1990s'],
  '00s': ['2000年代', 'the 2000s'],
  '10s': ['2010年代', 'the 2010s'],
  '20s': ['2020年代', 'the 2020s'],
};

function vibeLabels(value) {
  const vibe = Number(value ?? 2.5);
  if (vibe <= 1.4) return ['コンシャス', 'conscious'];
  if (vibe <= 2.4) return ['レイドバック', 'laid-back'];
  if (vibe < 3.6) return ['バランス', 'balanced'];
  return ['ターント', 'turnt'];
}

function variantFor(id) {
  return [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
}

function buildDescription(song, metadata) {
  const title = metadata.title.trim().replace(/\s+/g, ' ');
  const author = (metadata.author_name || 'YouTube').trim().replace(/\s+/g, ' ');
  const [regionJa, regionEn] = regionLabels[song.region] || regionLabels.other;
  const [eraJa, eraEn] = eraLabels[song.era] || ['年代横断', 'across eras'];
  const [vibeJa, vibeEn] = vibeLabels(song.conscious_turnt);
  const variant = variantFor(song.youtube_id);
  const templates = [
    {
      ja: `YouTubeで公開中の「${title}」。SLAPSでは${eraJa}・${regionJa}の${vibeJa}セレクトとして収録。`,
      en: `“${title}” on YouTube, catalogued by SLAPS as a ${vibeEn} hip-hop pick from ${regionEn} in ${eraEn}.`,
    },
    {
      ja: `${author}公開の「${title}」。${regionJa} / ${eraJa}、SLAPSのVIBEでは${vibeJa}寄り。`,
      en: `“${title}” from ${author}. ${regionEn} / ${eraEn}, placed on the ${vibeEn} side of the SLAPS vibe scale.`,
    },
    {
      ja: `SLAPSアーカイブから「${title}」。${regionJa}の${eraJa}ヒップホップ、VIBEは${vibeJa}。`,
      en: `From the SLAPS archive: “${title}”. ${eraEn} hip-hop from ${regionEn}, with a ${vibeEn} vibe setting.`,
    },
  ];
  return {
    ja: templates[variant].ja.slice(0, 250),
    en: templates[variant].en.slice(0, 250),
  };
}

async function fetchWithRetry(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 400));
  }
  throw lastError;
}

async function verify(song) {
  const watchUrl = `https://www.youtube.com/watch?v=${song.youtube_id}`;
  const [oembed, thumbnail] = await Promise.all([
    fetchWithRetry(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`),
    fetchWithRetry(`https://img.youtube.com/vi/${song.youtube_id}/mqdefault.jpg`, { method: 'HEAD' }),
  ]);
  return {
    youtube_id: song.youtube_id,
    metadata: await oembed.json(),
    thumbnail_status: thumbnail.status,
  };
}

async function runPool(items, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await verify(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

(async () => {
  const verified = await runPool(targets, 6);
  const metadataById = new Map(verified.map(item => [item.youtube_id, item.metadata]));
  for (const song of songs) {
    const metadata = metadataById.get(song.youtube_id);
    if (metadata) song.description = buildDescription(song, metadata);
  }
  fs.writeFileSync(songsPath, `${JSON.stringify(songs, null, 2)}\n`);
  const outputDir = path.join(root, 'outputs');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'description-fill.json'), `${JSON.stringify({
    generated_at: new Date().toISOString(),
    verified: verified.length,
    youtube_ids: verified.map(item => item.youtube_id),
  }, null, 2)}\n`);
  console.log(`Verified and filled ${verified.length} bilingual descriptions.`);
})().catch(error => {
  console.error(`Description fill aborted: ${error.message}`);
  process.exitCode = 1;
});
