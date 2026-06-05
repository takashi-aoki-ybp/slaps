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

  const { youtube_id, code } = req.body;

  if (!youtube_id || !/^[A-Za-z0-9_-]{11}$/.test(youtube_id)) {
    return res.status(400).json({ error: 'Invalid YouTube ID' });
  }

  const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!kvEnabled) {
    return res.status(200).json({ status: 'mock_success' });
  }

  try {
    // Redis HINCRBY slaps:broken [youtube_id] 1
    const currentVotes = await kvFetch(['HINCRBY', 'slaps:broken', youtube_id, '1']);
    
    // 詳細なログを保存
    const logItem = {
      youtube_id,
      code: code || '',
      current_votes: currentVotes,
      created_at: new Date().toISOString()
    };
    await kvFetch(['LPUSH', 'slaps:broken_logs', JSON.stringify(logItem)]);

    res.status(200).json({ status: 'success', current_votes: currentVotes });
  } catch (error) {
    console.error('Failed to mark broken:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
