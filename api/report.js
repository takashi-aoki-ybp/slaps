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
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { youtube_id, name, reason, note } = req.body;

  if (!youtube_id || !/^[A-Za-z0-9_-]{11}$/.test(youtube_id)) {
    return res.status(400).json({ error: 'Invalid YouTube ID' });
  }

  const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!kvEnabled) {
    return res.status(503).json({ error: 'Report storage unavailable' });
  }

  try {
    const prefix = process.env.DB_PREFIX || '';
    const report = {
      youtube_id,
      name: (name && name.slice(0, 150)) || '',
      reason: (reason && reason.slice(0, 100)) || '',
      note: (note && note.slice(0, 500)) || '',
      created_at: new Date().toISOString()
    };

    await kvFetch(['LPUSH', `${prefix}slaps:reports`, JSON.stringify(report)]);

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Failed to save report:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
