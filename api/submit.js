import { classifySong } from './utils/classifier.js';

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

  let { youtube_id, name, region, era, user_name, description, thumbnail, conscious_turnt } = req.body;

  // 厳格なバリデーション
  if (!youtube_id || !/^[A-Za-z0-9_-]{11}$/.test(youtube_id)) {
    return res.status(400).json({ error: 'Invalid YouTube ID' });
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 150) {
    return res.status(400).json({ error: 'Invalid song name (1-150 chars)' });
  }

  // region/era の自動分類とフォールバック
  const guesses = classifySong({ name, region, era, description });
  if (!region || region === '' || region === 'other') {
    region = guesses.region;
  }
  if (!era || era === '' || era === 'other') {
    era = guesses.era;
  }

  // 検証
  if (!['us', 'jp', 'uk', 'fr', 'kr', 'other'].includes(region)) {
    return res.status(400).json({ error: 'Invalid region' });
  }
  if (!['90s', '00s', '10s', '20s'].includes(era)) {
    return res.status(400).json({ error: 'Invalid era' });
  }

  // description (文字列またはオブジェクト) のパース
  let jaDesc = '';
  let enDesc = '';
  if (description) {
    if (typeof description === 'object') {
      jaDesc = (description.ja && typeof description.ja === 'string') ? description.ja.trim().slice(0, 250) : '';
      enDesc = (description.en && typeof description.en === 'string') ? description.en.trim().slice(0, 250) : '';
    } else if (typeof description === 'string') {
      jaDesc = description.trim().slice(0, 250);
    }
  }

  const finalSong = {
    youtube_id,
    name: name.trim(),
    region,
    era,
    user_name: (user_name && typeof user_name === 'string' && user_name.trim().slice(0, 50)) || 'Anonymous',
    description: {
      ja: jaDesc,
      en: enDesc
    },
    thumbnail: thumbnail || `https://img.youtube.com/vi/${youtube_id}/mqdefault.jpg`,
    conscious_turnt: typeof conscious_turnt === 'number' ? conscious_turnt : 2.5,
    created_at: new Date().toISOString()
  };

  const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!kvEnabled) {
    return res.status(200).json({
      status: 'mock_success',
      song: finalSong
    });
  }

  try {
    const isDup = await kvFetch(['SISMEMBER', 'slaps:existing_ids', youtube_id]);
    if (isDup === 1) {
      return res.status(400).json({ error: 'This song already exists on SLAPS.' });
    }

    // LPUSH & SADD
    await kvFetch(['LPUSH', 'slaps:songs', JSON.stringify(finalSong)]);
    await kvFetch(['SADD', 'slaps:existing_ids', youtube_id]);

    return res.status(200).json({ status: 'success', song: finalSong });
  } catch (error) {
    console.error('Failed to submit song:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
