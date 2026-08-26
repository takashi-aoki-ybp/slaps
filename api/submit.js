import { classifySong } from './utils/classifier.js';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

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
  if (conscious_turnt != null &&
      (typeof conscious_turnt !== 'number' || !Number.isFinite(conscious_turnt) || conscious_turnt < 0 || conscious_turnt > 5)) {
    return res.status(400).json({ error: 'Invalid conscious_turnt (0-5)' });
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

  const song = {
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
    conscious_turnt: conscious_turnt == null ? 2.5 : conscious_turnt,
  };

  const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!kvEnabled) {
    return res.status(503).json({ error: 'Submission storage unavailable' });
  }

  try {
    const prefix = process.env.DB_PREFIX || '';
    const localSongs = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'songs.json'), 'utf8'));
    const [isPublished, isPending] = await Promise.all([
      kvFetch(['SISMEMBER', `${prefix}slaps:existing_ids`, youtube_id]),
      kvFetch(['SISMEMBER', `${prefix}slaps:submission_ids`, youtube_id]),
    ]);
    if (isPublished === 1 || localSongs.some(item => item.youtube_id === youtube_id)) {
      return res.status(400).json({ error: 'This song already exists on SLAPS.' });
    }
    if (isPending === 1) {
      return res.status(409).json({ error: 'This song is already awaiting review.' });
    }

    const submission = {
      ...song,
      submission_id: randomUUID(),
      status: 'pending',
      submitted_at: new Date().toISOString(),
    };

    const reserved = await kvFetch(['SADD', `${prefix}slaps:submission_ids`, youtube_id]);
    if (reserved !== 1) {
      return res.status(409).json({ error: 'This song is already awaiting review.' });
    }
    try {
      await kvFetch(['LPUSH', `${prefix}slaps:submissions`, JSON.stringify(submission)]);
    } catch (error) {
      await kvFetch(['SREM', `${prefix}slaps:submission_ids`, youtube_id]).catch(() => {});
      throw error;
    }

    return res.status(202).json({ status: 'pending', submission });
  } catch (error) {
    console.error('Failed to submit song:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
