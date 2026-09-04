import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import requestGuards from './utils/request-guards.js';

const { isCataloguedYoutubeId, takeRateLimit } = requestGuards;

const OG_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

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
  if (data.error) throw new Error(`KV command failed: ${data.error}`);
  return data.result;
}

export default async function handler(req, res) {
  const { v } = req.query;

  if (!v || !/^[A-Za-z0-9_-]{11}$/.test(v)) {
    return res.status(400).send('Missing video ID parameter "v"');
  }

  const prefix = process.env.DB_PREFIX || '';
  if (!(await isCataloguedYoutubeId(v, kvFetch, prefix))) {
    return res.status(404).send('Track not found');
  }
  const rate = await takeRateLimit({
    req,
    kvFetch,
    prefix,
    scope: 'og_image',
    limit: 120,
    windowSeconds: 60,
  });
  if (!rate.allowed) return res.status(429).send('Too Many Requests');

  // Redis (Vercel KV) からキャッシュの取得を試みる
  try {
    const cachedBase64 = await kvFetch(['GET', `${prefix}slaps:og:${v}`]);
    if (cachedBase64) {
      const buffer = Buffer.from(cachedBase64, 'base64');
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      res.setHeader('X-Slaps-Cache', 'KV_HIT');
      return res.send(buffer);
    }
  } catch (kvError) {
    console.error('KV Cache Read Error:', kvError);
  }

  try {
    // 1. YouTubeのhqdefaultサムネイル画像 (480x360) を読み込む
    const ytThumbnailUrl = `https://img.youtube.com/vi/${v}/hqdefault.jpg`;
    const thumbnailResponse = await fetch(ytThumbnailUrl);
    if (!thumbnailResponse.ok) throw new Error(`Thumbnail error: ${thumbnailResponse.status}`);
    const thumbnailBuffer = Buffer.from(await thumbnailResponse.arrayBuffer());
    
    // 2. 重ね合わせ用の SLAPS ロゴ付き中央画像 (share_center.png) のパス
    const overlayPath = path.join(process.cwd(), 'assets', 'share_center.png');
    const overlayBuffer = fs.readFileSync(overlayPath);

    // hqdefaultは通常 480x360 ですが、念のため 1200x630 もしくはそれに準じるサイズにリサイズするか、
    // あるいはそのままアスペクト比を維持しつつ重ね合わせます。
    // Facebook推奨OGPサイズ（1200x630）に合わせるため、まず背景画像を1200x630にフィット（クロップ＆リサイズ）させます。
    const overlay = await sharp(overlayBuffer)
      .resize(320, 320, { fit: 'fill' })
      .png()
      .toBuffer();
    const buffer = await sharp(thumbnailBuffer)
      .resize(1200, 630, { fit: 'cover', position: 'centre' })
      .composite([{ input: overlay, left: 440, top: 155 }])
      .jpeg({ quality: 85 })
      .toBuffer();

    // Vercel KV へのキャッシュ書き込み
    try {
      const base64 = buffer.toString('base64');
      await kvFetch([
        'SET',
        `${prefix}slaps:og:${v}`,
        base64,
        'EX',
        OG_CACHE_TTL_SECONDS,
      ]);
    } catch (kvError) {
      console.error('KV Cache Write Error:', kvError);
    }

    // 適切なキャッシュヘッダーとコンテンツタイプを設定
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('X-Slaps-Cache', 'KV_MISS');
    return res.send(buffer);

  } catch (error) {
    console.error('OG Image Generation Error:', error);
    // エラー時はデフォルトのOGP画像をフォールバックとして配信
    try {
      const defaultOgpPath = path.join(process.cwd(), 'assets', 'ogp.png');
      const buffer = fs.readFileSync(defaultOgpPath);
      res.setHeader('Content-Type', 'image/png');
      return res.send(buffer);
    } catch (e) {
      return res.status(500).send('Internal Server Error');
    }
  }
}
