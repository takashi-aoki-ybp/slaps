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
    // KVが有効な場合のみリアルタイムプレゼンスを処理（未実装のためスキップ）
    // TODO: KV接続時にSortedSetでクライアント管理を実装する
    if (kvEnabled) {
      // 将来的な実装エリア
      // ZADD slaps:presence <timestamp> <clientId> → 30秒以内のメンバー数をカウント
    }

    return res.status(200).json({
      // onlineCount は KV 実装完了まで返さない（フロントのバッジを非表示のままにする）
    });

  } catch (error) {
    console.error('Presence API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
