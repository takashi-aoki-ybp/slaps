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

  const { youtube_id, name, region, era, user_name, description, thumbnail, conscious_turnt } = req.body;

  // 厳格なバリデーション
  if (!youtube_id || !/^[A-Za-z0-9_-]{11}$/.test(youtube_id)) {
    return res.status(400).json({ error: 'Invalid YouTube ID' });
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 150) {
    return res.status(400).json({ error: 'Invalid song name (1-150 chars)' });
  }
  if (!['us', 'jp', 'uk', 'fr', 'kr', 'other'].includes(region)) {
    return res.status(400).json({ error: 'Invalid region' });
  }
  if (!['90s', '00s', '10s', '20s'].includes(era)) {
    return res.status(400).json({ error: 'Invalid era' });
  }

  const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!kvEnabled) {
    // 開発用モック動作
    return res.status(200).json({
      status: 'mock_success',
      song: {
        youtube_id,
        name: name.trim(),
        region,
        era,
        user_name: (user_name && user_name.trim().slice(0, 50)) || 'Anonymous',
        description: {
          ja: (description && description.ja && description.ja.trim().slice(0, 250)) || '',
          en: (description && description.en && description.en.trim().slice(0, 250)) || ''
        },
        thumbnail: thumbnail || `https://img.youtube.com/vi/${youtube_id}/mqdefault.jpg`,
        conscious_turnt: typeof conscious_turnt === 'number' ? conscious_turnt : 2.5,
        created_at: new Date().toISOString()
      }
    });
  }

  try {
    // 重複チェック
    const isDup = await kvFetch(['SISMEMBER', 'slaps:existing_ids', youtube_id]);
    if (isDup === 1) {
      return res.status(400).json({ error: 'This song already exists on SLAPS.' });
    }

    const song = {
      youtube_id,
      name: name.trim(),
      region,
      era,
      user_name: (user_name && user_name.trim().slice(0, 50)) || 'Anonymous',
      description: {
        ja: (description && description.ja && description.ja.trim().slice(0, 250)) || '',
        en: (description && description.en && description.en.trim().slice(0, 250)) || ''
      },
      thumbnail: thumbnail || `https://img.youtube.com/vi/${youtube_id}/mqdefault.jpg`,
      conscious_turnt: typeof conscious_turnt === 'number' ? conscious_turnt : 2.5,
      created_at: new Date().toISOString()
    };

    // LPUSH & SADD
    await kvFetch(['LPUSH', 'slaps:songs', JSON.stringify(song)]);
    await kvFetch(['SADD', 'slaps:existing_ids', youtube_id]);

    res.status(200).json({ status: 'success', song });
  } catch (error) {
    console.error('Failed to submit song:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
