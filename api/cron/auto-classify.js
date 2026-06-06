import { classifySong } from '../utils/classifier.js';

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
  // Cron 認証チェック (Vercel Cron Job 用)
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const prefix = process.env.DB_PREFIX || '';
    const rawList = await kvFetch(['LRANGE', `${prefix}slaps:songs`, '0', '-1']);
    if (!rawList || !Array.isArray(rawList)) {
      return res.status(200).json({ message: 'No songs found' });
    }

    let updatedCount = 0;
    const updatedSongs = [];

    rawList.forEach((item) => {
      const song = JSON.parse(item);
      const { region, era } = classifySong(song);

      if (song.region !== region || song.era !== era) {
        song.region = region;
        song.era = era;
        updatedCount++;
      }
      updatedSongs.push(song);
    });

    if (updatedCount > 0) {
      // 一括上書き
      await kvFetch(['DEL', `${prefix}slaps:songs`]);
      const jsonStrings = updatedSongs.map((s) => JSON.stringify(s));
      await kvFetch(['RPUSH', `${prefix}slaps:songs`, ...jsonStrings]);
      
      return res.status(200).json({
        message: `Successfully completed auto-classification. Updated ${updatedCount} songs.`
      });
    } else {
      return res.status(200).json({ message: 'No updates required' });
    }
  } catch (error) {
    console.error('Cron job failed:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
