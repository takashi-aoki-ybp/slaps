const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const { isCataloguedYoutubeId, takeRateLimit } = require('./utils/request-guards.js');

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
  return data.result;
}

module.exports = async function handler(req, res) {
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

    // 並列で画像をロード
    const [bgImage, overlayImage] = await Promise.all([
      Jimp.read(thumbnailBuffer),
      Jimp.read(overlayBuffer)
    ]);

    // hqdefaultは通常 480x360 ですが、念のため 1200x630 もしくはそれに準じるサイズにリサイズするか、
    // あるいはそのままアスペクト比を維持しつつ重ね合わせます。
    // Facebook推奨OGPサイズ（1200x630）に合わせるため、まず背景画像を1200x630にフィット（クロップ＆リサイズ）させます。
    bgImage.cover(1200, 630, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);

    // YouTube画像の上に黒い半透明（シャドウ）フィルターを掛けてロゴを際立たせる（オプション）
    // 今回はユーザー提示の「重ねる画像」との親和性を考え、必要に応じて中央のロゴを重ねます。
    // overlayImage (share_center.png) をリサイズして中央にブレンド
    // share_center.png は中央の正方形を想定しています。
    overlayImage.resize(320, 320); // 中央のSLAPSロゴのサイズ感を320x320ピクセルに調整

    const x = (bgImage.bitmap.width - overlayImage.bitmap.width) / 2;
    const y = (bgImage.bitmap.height - overlayImage.bitmap.height) / 2;

    bgImage.composite(overlayImage, x, y);

    // 3. バッファに変換して画像として返却（処理速度が圧倒的に速いJPEGに変更し、画質を85%に設定）
    bgImage.quality(85);
    const buffer = await bgImage.getBufferAsync(Jimp.MIME_JPEG);

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
