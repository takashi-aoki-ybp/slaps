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

  if (method === 'GET') {
    const { v: youtube_id } = req.query;
    if (!youtube_id || !/^[A-Za-z0-9_-]{11}$/.test(youtube_id)) {
      return res.status(400).json({ error: 'Invalid YouTube ID' });
    }

    try {
      const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
      if (!kvEnabled) {
        return res.status(200).json({ comments: [] });
      }

      const rawComments = await kvFetch(['LRANGE', `${prefix}slaps:comments:${youtube_id}`, 0, -1]) || [];
      const comments = rawComments.map(c => JSON.parse(c));
      
      if (comments.length > 0) {
        const likeKeys = comments.map(c => `${prefix}slaps:likes:${youtube_id}:${c.id}`);
        try {
          const likesArray = await kvFetch(['MGET', ...likeKeys]) || [];
          comments.forEach((c, idx) => {
            c.likes = parseInt(likesArray[idx] || 0, 10);
          });
        } catch (likeErr) {
          console.error('Failed to fetch likes, defaulting to 0:', likeErr);
          comments.forEach(c => {
            c.likes = 0;
          });
        }
      }

      comments.sort((a, b) => a.time - b.time);

      return res.status(200).json({ comments });
    } catch (error) {
      console.error('Failed to get comments:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  if (method === 'POST') {
    const { youtube_id, time, text, user_name } = req.body;

    if (!youtube_id || !/^[A-Za-z0-9_-]{11}$/.test(youtube_id)) {
      return res.status(400).json({ error: 'Invalid YouTube ID' });
    }
    if (typeof time !== 'number' || time < 0) {
      return res.status(400).json({ error: 'Invalid time parameter' });
    }

    const finalComment = {
      id: Math.random().toString(36).slice(2, 11),
      time: Math.round(time * 10) / 10,
      text: (text && typeof text === 'string') ? text.trim().slice(0, 140) : '',
      user_name: (user_name && typeof user_name === 'string' && user_name.trim().slice(0, 50)) || 'Anonymous',
      created_at: new Date().toISOString()
    };

    try {
      const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
      if (!kvEnabled) {
        return res.status(503).json({ error: 'Comment storage unavailable' });
      }
      await Promise.all([
        kvFetch(['RPUSH', `${prefix}slaps:comments:${youtube_id}`, JSON.stringify(finalComment)]),
        kvFetch(['HINCRBY', `${prefix}slaps:vibe_counts`, youtube_id, 1])
      ]);

      return res.status(200).json({ status: 'success', comment: finalComment });
    } catch (error) {
      console.error('Failed to post comment:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}
