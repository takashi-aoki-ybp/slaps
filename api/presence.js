import fs from 'fs';
import path from 'path';
const { isAllowedWebOrigin, isCataloguedYoutubeId, requesterDigest } = require('./utils/request-guards.js');

const PRESENCE_WINDOW_MS = 30000;
const PRESENCE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const LOCAL_RATE_WINDOW_MS = 60 * 1000;
const LOCAL_RATE_LIMIT = 120;
const localRateWindows = new Map();
let lastPresenceCleanupAt = 0;

// KVのフェッチ用関数
async function kvFetch(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
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
  if (data.error) throw new Error(`KV command failed: ${data.error}`);
  return data.result;
}

async function kvPipeline(commands) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`KV pipeline error: ${res.statusText}`);

  const results = await res.json();
  const failed = results.find(item => item?.error);
  if (failed) throw new Error(`KV command error: ${failed.error}`);
  return results.map(item => item?.result);
}

function isValidClientId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

function normalizeYoutubeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{6,20}$/.test(value)
    ? value
    : '';
}

// Presence is called frequently by the first-party player. Charging Redis once
// more per heartbeat just to rate-limit that same heartbeat consumed a large
// part of the free monthly command quota. Keep a deliberately generous
// per-instance guard here; the origin check remains the public boundary.
function takeLocalRateLimit(req, now = Date.now()) {
  const key = requesterDigest(req);
  const current = localRateWindows.get(key);
  if (!current || current.expiresAt <= now) {
    localRateWindows.set(key, { count: 1, expiresAt: now + LOCAL_RATE_WINDOW_MS });
    return true;
  }

  current.count += 1;
  if (localRateWindows.size > 1000) {
    for (const [candidate, window] of localRateWindows) {
      if (window.expiresAt <= now) localRateWindows.delete(candidate);
    }
  }
  return current.count <= LOCAL_RATE_LIMIT;
}

export default async function handler(req, res) {
  // CORS とキャッシュ無効化
  const origin = String(req.headers?.origin || '').trim();
  if (origin && isAllowedWebOrigin(req)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (!isAllowedWebOrigin(req)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { clientId, youtubeId } = req.body || {};
  if (!isValidClientId(clientId)) {
    return res.status(400).json({ error: 'valid clientId is required' });
  }
  if (typeof req.body?.wantsListeningSnapshot !== 'boolean') {
    // Old pages keep running their timer even after a new deployment. Do not
    // let those stale background tabs keep draining the monthly Redis quota.
    // The player remains usable; a reload upgrades the presence protocol.
    return res.status(409).json({ error: 'Presence client refresh required' });
  }

  const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  try {
    if (!kvEnabled) {
      return res.status(503).json({
        error: 'Presence storage unavailable',
        onlineCount: null,
        someoneListeningTo: null,
      });
    }

    if (!takeLocalRateLimit(req)) return res.status(429).json({ error: 'Too Many Requests' });

    const prefix = process.env.DB_PREFIX || '';
    const presenceKey = `${prefix}slaps:presence:v2`;
    const tracksKey = `${prefix}slaps:presence:tracks:v2`;
    const now = Date.now();
    const cutoff = now - PRESENCE_WINDOW_MS;
    const hasYoutubeIdUpdate = Object.prototype.hasOwnProperty.call(req.body || {}, 'youtubeId');
    const candidateYoutubeId = hasYoutubeIdUpdate ? normalizeYoutubeId(youtubeId) : '';
    const currentYoutubeId = candidateYoutubeId && await isCataloguedYoutubeId(candidateYoutubeId, kvFetch, prefix)
      ? candidateYoutubeId
      : '';
    const includeListeningSnapshot = req.body.wantsListeningSnapshot && Math.random() < 0.3;
    const shouldCleanup = now - lastPresenceCleanupAt >= PRESENCE_CLEANUP_INTERVAL_MS;

    // The live count only needs ZADD + ZCOUNT. Track state is written only when
    // the browser says it changed, and the optional ticker snapshot is sampled.
    // This preserves the measured 30-second count while avoiding 7-8 Redis
    // commands on every ten-second heartbeat.
    const commands = [['ZADD', presenceKey, now.toString(), clientId]];
    if (hasYoutubeIdUpdate) {
      commands.push(currentYoutubeId
        ? ['HSET', tracksKey, clientId, currentYoutubeId]
        : ['HDEL', tracksKey, clientId]);
    }
    const onlineCountIndex = commands.push([
      'ZCOUNT', presenceKey, `(${cutoff}`, '+inf',
    ]) - 1;
    const activeClientIdsIndex = includeListeningSnapshot
      ? commands.push(['ZRANGEBYSCORE', presenceKey, `(${cutoff}`, '+inf']) - 1
      : -1;
    if (shouldCleanup) {
      commands.push(['ZREMRANGEBYSCORE', presenceKey, '-inf', cutoff.toString()]);
    }

    const results = await kvPipeline(commands);
    if (shouldCleanup) lastPresenceCleanupAt = now;

    const onlineCount = Number(results?.[onlineCountIndex] || 0);
    const activeClientIds = activeClientIdsIndex >= 0 && Array.isArray(results?.[activeClientIdsIndex])
      ? results[activeClientIdsIndex]
      : [];

    const jsonPath = path.join(process.cwd(), 'data', 'songs.json');
    let someoneListeningTo = null;
    const otherClientIds = activeClientIds.filter(id => id !== clientId);

    if (otherClientIds.length > 0 && fs.existsSync(jsonPath)) {
      const otherYoutubeIds = await kvFetch(['HMGET', tracksKey, ...otherClientIds]);
      const localSongs = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const activeYoutubeIds = Array.isArray(otherYoutubeIds)
        ? otherYoutubeIds.filter(id => id && id !== currentYoutubeId)
        : [];
      const actualListeningSongs = localSongs.filter(song => activeYoutubeIds.includes(song.youtube_id));

      // 通知頻度は抑えるが、表示する場合は実際のアクティブ接続が再生中の曲だけを使う。
      if (actualListeningSongs.length > 0) {
        const selectedSong = actualListeningSongs[Math.floor(Math.random() * actualListeningSongs.length)];
        someoneListeningTo = {
          youtube_id: selectedSong.youtube_id,
          title: selectedSong.name,
        };
      }
    }

    return res.status(200).json({
      onlineCount,
      someoneListeningTo,
      source: 'realtime',
      windowSeconds: PRESENCE_WINDOW_MS / 1000,
    });

  } catch (error) {
    console.error('Presence API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
