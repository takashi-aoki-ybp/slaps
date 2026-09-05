import { Jimp, JimpMime, HorizontalAlign, VerticalAlign } from 'jimp';
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

const cacheHeaders = (contentType, cacheState) => ({
  'Content-Type': contentType,
  'Cache-Control': 'public, max-age=86400, s-maxage=86400',
  ...(cacheState ? { 'X-Slaps-Cache': cacheState } : {}),
});

const textResponse = (body, status) => new Response(body, {
  status,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});

export async function handleOgImage(request) {
  const requestUrl = new URL(request.url);
  const v = requestUrl.searchParams.get('v') || '';

  if (!v || !/^[A-Za-z0-9_-]{11}$/.test(v)) {
    return textResponse('Missing video ID parameter "v"', 400);
  }

  const prefix = process.env.DB_PREFIX || '';
  if (!(await isCataloguedYoutubeId(v, kvFetch, prefix))) {
    return textResponse('Track not found', 404);
  }
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const realIp = request.headers.get('x-real-ip') || '';
  const rate = await takeRateLimit({
    req: { headers: { 'x-forwarded-for': forwardedFor, 'x-real-ip': realIp } },
    kvFetch,
    prefix,
    scope: 'og_image',
    limit: 120,
    windowSeconds: 60,
  });
  if (!rate.allowed) return textResponse('Too Many Requests', 429);

  // Redis (Vercel KV) からキャッシュの取得を試みる
  try {
    const cachedBase64 = await kvFetch(['GET', `${prefix}slaps:og:${v}`]);
    if (cachedBase64) {
      const buffer = Buffer.from(cachedBase64, 'base64');
      return new Response(buffer, { headers: cacheHeaders('image/jpeg', 'KV_HIT') });
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
    const [background, overlay] = await Promise.all([
      Jimp.read(thumbnailBuffer),
      Jimp.read(overlayBuffer),
    ]);
    background.cover({
      w: 1200,
      h: 630,
      align: HorizontalAlign.CENTER | VerticalAlign.MIDDLE,
    });
    overlay.resize({ w: 320, h: 320 });
    background.composite(overlay, 440, 155);
    const buffer = await background.getBuffer(JimpMime.jpeg, { quality: 85 });

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
    return new Response(buffer, { headers: cacheHeaders('image/jpeg', 'KV_MISS') });

  } catch (error) {
    console.error('OG Image Generation Error:', error);
    // エラー時はデフォルトのOGP画像をフォールバックとして配信
    try {
      const defaultOgpPath = path.join(process.cwd(), 'assets', 'ogp.png');
      const buffer = fs.readFileSync(defaultOgpPath);
      return new Response(buffer, { headers: cacheHeaders('image/png') });
    } catch (e) {
      return textResponse('Internal Server Error', 500);
    }
  }
}

export default { fetch: handleOgImage };
