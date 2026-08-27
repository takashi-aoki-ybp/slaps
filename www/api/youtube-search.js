const CLIENT_VERSION = process.env.YOUTUBE_INNERTUBE_CLIENT_VERSION || '2.20260826.01.00';

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
    return res.status(200).json({ videoId });
  } catch (error) {
    console.error('YouTube search error:', error);
    return res.status(502).json({ error: 'YouTube search temporarily unavailable' });
  }
}
