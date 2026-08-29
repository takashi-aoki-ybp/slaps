import fs from 'fs';
import path from 'path';

const PRESENCE_WINDOW_MS = 30000;

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

export default async function handler(req, res) {
  // CORS とキャッシュ無効化
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

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

  const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  try {
    if (!kvEnabled) {
      return res.status(503).json({
        error: 'Presence storage unavailable',
        onlineCount: null,
        someoneListeningTo: null,
      });
    }

    const prefix = process.env.DB_PREFIX || '';
    const presenceKey = `${prefix}slaps:presence:v2`;
    const tracksKey = `${prefix}slaps:presence:tracks:v2`;
    const now = Date.now();
    const cutoff = now - PRESENCE_WINDOW_MS;
    const currentYoutubeId = normalizeYoutubeId(youtubeId);
    const staleClientIds = await kvFetch([
      'ZRANGEBYSCORE', presenceKey, '-inf', cutoff.toString(),
    ]);

    if (Array.isArray(staleClientIds) && staleClientIds.length > 0) {
      await kvFetch(['HDEL', tracksKey, ...staleClientIds]);
    }

    // clientIdをmemberに固定するため、同じブラウザーのheartbeatは常に上書きされる。
    const results = await kvPipeline([
      ['ZADD', presenceKey, now.toString(), clientId],
      currentYoutubeId
        ? ['HSET', tracksKey, clientId, currentYoutubeId]
        : ['HDEL', tracksKey, clientId],
      ['ZREMRANGEBYSCORE', presenceKey, '-inf', cutoff.toString()],
      ['ZCARD', presenceKey],
      ['ZRANGE', presenceKey, '0', '-1'],
    ]);

    const onlineCount = Number(results?.[3] || 0);
    const activeClientIds = Array.isArray(results?.[4]) ? results[4] : [];

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
      if (actualListeningSongs.length > 0 && Math.random() < 0.3) {
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
