const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const CATALOG_CACHE_MS = 60 * 1000;
const catalogCaches = new Map();

function validYoutubeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);
}

function requesterDigest(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || String(req.headers?.['x-real-ip'] || '').trim() || 'unknown';
  return createHash('sha256').update(address).digest('hex').slice(0, 24);
}

async function loadCatalogIds(kvFetch, prefix = '') {
  const cached = catalogCaches.get(prefix);
  if (cached?.ids && cached.expiresAt > Date.now()) return cached.ids;

  const localPath = path.join(process.cwd(), 'data', 'songs.json');
  const localSongs = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  const ids = new Set(localSongs.map((song) => song.youtube_id).filter(validYoutubeId));

  let kvReadSucceeded = typeof kvFetch !== 'function';
  if (typeof kvFetch === 'function') {
    try {
      const rawSongs = await kvFetch(['LRANGE', `${prefix}slaps:songs`, '0', '-1']);
      for (const raw of Array.isArray(rawSongs) ? rawSongs : []) {
        try {
          const song = JSON.parse(raw);
          if (validYoutubeId(song?.youtube_id)) ids.add(song.youtube_id);
        } catch (_) {
          // A malformed legacy row must not make every public endpoint unavailable.
        }
      }
      kvReadSucceeded = true;
    } catch (_) {
      // Local curated songs remain usable if KV is temporarily unavailable.
    }
  }

  if (kvReadSucceeded) catalogCaches.set(prefix, { expiresAt: Date.now() + CATALOG_CACHE_MS, ids });
  return ids;
}

async function isCataloguedYoutubeId(id, kvFetch, prefix = '') {
  if (!validYoutubeId(id)) return false;
  return (await loadCatalogIds(kvFetch, prefix)).has(id);
}

async function filterCataloguedYoutubeIds(ids, kvFetch, prefix = '') {
  const catalogIds = await loadCatalogIds(kvFetch, prefix);
  return ids.filter((id) => validYoutubeId(id) && catalogIds.has(id));
}

async function takeRateLimit({ req, kvFetch, prefix = '', scope, limit, windowSeconds }) {
  if (typeof kvFetch !== 'function') return { allowed: true, remaining: limit };
  try {
    const key = `${prefix}slaps:rate:${scope}:${requesterDigest(req)}`;
    const attempts = Number(await kvFetch(['INCR', key]) || 0);
    if (attempts === 1) await kvFetch(['EXPIRE', key, String(windowSeconds)]);
    return { allowed: attempts <= limit, remaining: Math.max(0, limit - attempts) };
  } catch (_) {
    // Rate limiting must not turn a transient KV read problem into an outage.
    return { allowed: true, remaining: limit };
  }
}

function isAllowedWebOrigin(req) {
  const origin = String(req.headers?.origin || '').trim();
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === 'slaps.tokyo' || url.hostname === 'www.slaps.tokyo') return true;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (url.protocol === 'https:' && url.hostname.endsWith('.vercel.app')) return true;
    return url.protocol === 'capacitor:' || url.protocol === 'ionic:';
  } catch (_) {
    return false;
  }
}

module.exports = {
  filterCataloguedYoutubeIds,
  isAllowedWebOrigin,
  isCataloguedYoutubeId,
  loadCatalogIds,
  requesterDigest,
  takeRateLimit,
  validYoutubeId,
};
