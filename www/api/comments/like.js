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

export default async function handler(req, res) {
  const method = req.method;
  const prefix = process.env.DB_PREFIX || '';

  if (method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { youtube_id, comment_id } = req.body;

  if (!youtube_id || !/^[A-Za-z0-9_-]{11}$/.test(youtube_id)) {
    return res.status(400).json({ error: 'Invalid YouTube ID' });
  }
  if (!comment_id || typeof comment_id !== 'string' || comment_id.trim().length === 0) {
    return res.status(400).json({ error: 'Invalid Comment ID' });
  }

  try {
    const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
    if (!kvEnabled) {
      // Mock environment (local dev without KV config)
      return res.status(200).json({ status: 'mock_success', likes: 1 });
    }

    const key = `${prefix}slaps:likes:${youtube_id}:${comment_id}`;
    // Increment the counter in Redis
    const newLikes = await kvFetch(['INCR', key]);

    return res.status(200).json({ status: 'success', likes: parseInt(newLikes || 0, 10) });
  } catch (error) {
    console.error('Failed to like comment:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
