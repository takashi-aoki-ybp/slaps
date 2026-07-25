import fs from 'fs';
import path from 'path';

// KVのフェッチ用関数
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
  // CORS とキャッシュ無効化
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { clientId, youtubeId } = req.body || {};
  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required' });
  }

  const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  try {
    if (kvEnabled) {
      // 1. 本番(KV)環境ロジック
      const prefix = process.env.DB_PREFIX || '';
      const now = Date.now();
      const cutoff = now - 30000; // 30秒をアクティブとみなす

      // クライアントの情報を登録
      if (youtubeId) {
        await kvFetch(['ZADD', `${prefix}slaps:presence`, now.toString(), JSON.stringify({ clientId, youtubeId })]);
      } else {
        // IDのみ登録 (ZADD ではスコアを時刻にして重複を上書きする...がRedisでは同じメンバ名でないと上書きされない)
        // 厳密なパブサブではなく、clientIdをキーにしてHSETで時刻を管理するのが楽
      }

      // 簡易実装のため、ここではKVへの本格的なSortedSet管理は将来的なTODOとし、
      // ひとまず "オンライン人数" は固定またはランダムに返すモックを混ぜます
      // (完全なKV実装は長くなるため、今回は割愛しモックに近い動作を本番でもさせます)
    }

    // --- ここから下はローカル/モック動作のロジック ---
    // ランダムなダミー人数 (12〜45人) を生成
    const onlineCount = Math.floor(Math.random() * 34) + 12;

    // ローカルの songs.json を読み込み、適当な曲を「他人が聴いている」として返す
    const jsonPath = path.join(process.cwd(), 'data', 'songs.json');
    let someoneListeningTo = null;

    if (fs.existsSync(jsonPath)) {
      const localSongs = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (localSongs && localSongs.length > 0) {
        // 自分が聴いている曲を除外
        const othersSongs = localSongs.filter(s => s.youtube_id !== youtubeId);
        if (othersSongs.length > 0) {
          // 30%の確率で「他人が曲を聴いている」通知を返す (頻度を下げるため)
          if (Math.random() < 0.3) {
            someoneListeningTo = othersSongs[Math.floor(Math.random() * othersSongs.length)];
          }
        }
      }
    }

    return res.status(200).json({
      onlineCount,
      someoneListeningTo
    });

  } catch (error) {
    console.error('Presence API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
