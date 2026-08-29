import { createHash } from 'crypto';

const CLIENT_VERSION = process.env.YOUTUBE_INNERTUBE_CLIENT_VERSION || '2.20260826.01.00';

async function kvFetch(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`KV error: ${response.statusText}`);
  const data = await response.json();
  return data.result;
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

function findFirstVideoId(root) {
  if (!root || typeof root !== 'object') return null;
  if (root.videoRenderer && /^[A-Za-z0-9_-]{11}$/.test(root.videoRenderer.videoId || '')) {
    return root.videoRenderer.videoId;
  }
  for (const child of Object.values(root)) {
    const match = findFirstVideoId(child);
    if (match) return match;
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  const apiKey = process.env.YOUTUBE_INNERTUBE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'YouTube search is not configured' });
  }

  try {
    const prefix = process.env.DB_PREFIX || '';
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const address = forwarded || String(req.headers['x-real-ip'] || '').trim();
    if (address && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const rateKey = `${prefix}slaps:yt_search_rate:${digest(address)}`;
      const attempts = await kvFetch(['INCR', rateKey]);
      if (attempts === 1) await kvFetch(['EXPIRE', rateKey, '60']);
      if (attempts > 30) {
        return res.status(429).json({ error: 'Too many searches. Please wait a minute.' });
      }
    }

    const cacheKey = `${prefix}slaps:yt_search:v1:${digest(q.toLowerCase())}`;
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const cached = await kvFetch(['GET', cacheKey]);
      if (/^[A-Za-z0-9_-]{11}$/.test(cached || '')) {
        res.setHeader('X-Slaps-Cache', 'KV_HIT');
        return res.status(200).json({ videoId: cached });
      }
    }

    const response = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.youtube.com',
        'User-Agent': 'Mozilla/5.0',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': CLIENT_VERSION,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: CLIENT_VERSION,
            hl: 'ja',
            gl: 'JP',
          },
        },
        query: q,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`YouTube search returned ${response.status}`);
    }
    const data = await response.json();
    const videoId = findFirstVideoId(data);
    if (!videoId) {
      return res.status(404).json({ error: 'No video found' });
    }
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      await kvFetch(['SET', cacheKey, videoId, 'EX', '3600']);
      res.setHeader('X-Slaps-Cache', 'KV_MISS');
    }
    return res.status(200).json({ videoId });
  } catch (error) {
    console.error('YouTube search error:', error);
    return res.status(502).json({ error: 'YouTube search temporarily unavailable' });
  }
}
