import fs from 'fs';
import path from 'path';

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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Content-Type', 'application/json');

  try {
    const jsonPath = path.join(process.cwd(), 'data', 'songs.json');
    const localSongs = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    let dbSongs = [];
    const brokenVotes = {};
    const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
    if (kvEnabled) {
      const [rawList, rawBroken] = await Promise.all([
        kvFetch(['LRANGE', 'slaps:songs', '0', '-1']),
        kvFetch(['HGETALL', 'slaps:broken'])
      ]);

      if (rawList && Array.isArray(rawList)) {
        dbSongs = rawList.map(item => JSON.parse(item));
      }
      if (rawBroken && Array.isArray(rawBroken)) {
        for (let i = 0; i < rawBroken.length; i += 2) {
          brokenVotes[rawBroken[i]] = parseInt(rawBroken[i+1], 10);
        }
      }
    }

    // 重複を排除しつつマージ（DBの追加曲を優先）
    const localMap = new Map(localSongs.map(s => [s.youtube_id, s]));
    const dbMap = new Map(dbSongs.map(s => [s.youtube_id, s]));
    
    // 全IDのユニークリストを作成（DB側の曲が先頭にくることで新着判定しやすくする）
    const allIds = new Set([...dbMap.keys(), ...localMap.keys()]);
    const merged = [];
    for (const id of allIds) {
      if (dbMap.has(id)) {
        merged.push(dbMap.get(id));
      } else {
        merged.push(localMap.get(id));
      }
    }

    // 5票以上の報告がある曲を除外
    const filtered = merged.filter(song => {
      const votes = brokenVotes[song.youtube_id] || 0;
      return votes < 5;
    });

    res.status(200).json(filtered);
  } catch (error) {
    console.error('Failed to load songs:', error);
    try {
      const jsonPath = path.join(process.cwd(), 'data', 'songs.json');
      const localSongs = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      res.status(200).json(localSongs);
    } catch (e) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
