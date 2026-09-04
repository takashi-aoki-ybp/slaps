const fs = require('fs');
const path = require('path');

const args = new Set(process.argv.slice(2));
const batchArg = process.argv.find(arg => arg.startsWith('--batch-size='));
const batchSize = Math.max(1, Number(batchArg?.split('=')[1] || 50));
const auditAll = args.has('--all');
const root = path.join(__dirname, '..');
const songs = JSON.parse(fs.readFileSync(path.join(root, 'data', 'songs.json'), 'utf8'));
const dayIndex = Math.floor(Date.now() / 86400000);
const start = auditAll ? 0 : (dayIndex * batchSize) % songs.length;
const selected = auditAll
  ? songs
  : Array.from({ length: Math.min(batchSize, songs.length) }, (_, index) => songs[(start + index) % songs.length]);

const MIN_TRACK_SECONDS = 30;

function extractLengthSeconds(html = '') {
  const match = String(html).match(/"lengthSeconds":"(\d+)"/);
  return match ? Number(match[1]) : null;
}

function isTooShortTrack(durationSeconds) {
  return Number.isFinite(durationSeconds) && durationSeconds < MIN_TRACK_SECONDS;
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
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 500));
  }
  throw lastError;
}

async function auditSong(song) {
  const watchUrl = `https://www.youtube.com/watch?v=${song.youtube_id}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
  const thumbnailUrl = `https://img.youtube.com/vi/${song.youtube_id}/mqdefault.jpg`;
  try {
    const [oembedResponse, thumbnailResponse, watchResponse] = await Promise.all([
      fetchWithRetry(oembedUrl),
      fetchWithRetry(thumbnailUrl, { method: 'HEAD' }),
      fetchWithRetry(watchUrl),
    ]);
    const metadata = await oembedResponse.json();
    const durationSeconds = extractLengthSeconds(await watchResponse.text());
    if (isTooShortTrack(durationSeconds)) {
      return {
        youtube_id: song.youtube_id,
        ok: false,
        stored_name: song.name,
        youtube_title: metadata.title || '',
        duration_seconds: durationSeconds,
        error: `Video is only ${durationSeconds}s; likely a teaser or clip rather than a full track`,
      };
    }
    return {
      youtube_id: song.youtube_id,
      ok: true,
      stored_name: song.name,
      youtube_title: metadata.title || '',
      author_name: metadata.author_name || '',
      thumbnail_status: thumbnailResponse.status,
      duration_seconds: durationSeconds,
    };
  } catch (error) {
    return {
      youtube_id: song.youtube_id,
      ok: false,
      stored_name: song.name,
      error: error.message,
    };
  }
}

async function runPool(items, concurrency) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await auditSong(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function main() {
  const results = await runPool(selected, 5);
  const failures = results.filter(result => !result.ok);
  const report = {
    generated_at: new Date().toISOString(),
    mode: auditAll ? 'all' : 'daily_batch',
    start_index: start,
    checked: results.length,
    failures: failures.length,
    results,
  };
  const outputDir = path.join(root, 'outputs');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'youtube-audit.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Audited ${results.length} YouTube videos. Failures: ${failures.length}`);
  console.log(`Report: ${outputPath}`);
  for (const failure of failures) {
    console.error(`- ${failure.youtube_id} ${failure.stored_name}: ${failure.error}`);
  }
  if (failures.length > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { MIN_TRACK_SECONDS, extractLengthSeconds, isTooShortTrack };
