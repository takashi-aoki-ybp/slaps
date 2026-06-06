function next() {
  return new Response(null, {
    headers: {
      'x-middleware-next': '1'
    }
  });
}

// クローラー判定用の正規表現
const BOT_UA_REGEX = /bot|crawl|spider|facebook|twitter|slack|discord|whatsapp|telegram|line|pinterest/i;

export default async function middleware(request) {
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';

  // 拡張子（.css, .js, 画像等）および /api/ へのリクエストは無視
  if (url.pathname.startsWith('/api/') || (url.pathname.includes('.') && !url.pathname.endsWith('.html'))) {
    return next();
  }

  const videoId = url.searchParams.get('v');

  // 動画IDがあり、かつクローラーからのアクセスの時のみOGPをインジェクト
  if (videoId && BOT_UA_REGEX.test(userAgent)) {
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    let songName = "";
    let thumbnail = `/og-image/${videoId}.jpg`;

    if (kvUrl && kvToken) {
      try {
        const res = await fetch(kvUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${kvToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(['LRANGE', 'slaps:songs', 0, -1])
        });
        if (res.ok) {
          const data = await res.json();
          const rawList = data.result;
          if (rawList && Array.isArray(rawList)) {
            const song = rawList
              .map(item => { try { return JSON.parse(item); } catch { return null; } })
              .find(s => s && s.youtube_id === videoId);
            if (song) {
              songName = song.name;
            }
          }
        }
      } catch (e) {
        // Silent catch
      }
    }

    if (!songName) {
      try {
        const jsonUrl = new URL('./data/songs.json', request.url);
        const res = await fetch(jsonUrl);
        const songs = await res.json();
        const song = songs.find(s => s.youtube_id === videoId);
        if (song) {
          songName = song.name;
        }
      } catch (e) {
        // Fallback failed
      }
    }

    const title = "Playing on SLAPS";
    const desc = songName ? `Playing on SLAPS | ${songName}` : "Nothing but slaps. An online jukebox dedicated to HIPHOP.";


    // 元の index.html をフェッチ
    try {
      const indexUrl = new URL('./index.html', request.url);
      const indexRes = await fetch(indexUrl);
      let html = await indexRes.text();

      // OGPタグを置換
      const shareUrl = `${url.origin}/?v=${videoId}`;
      html = html.replace(/<meta property="og:title" content="[^"]*">/g, () => `<meta property="og:title" content="${title}">`);
      html = html.replace(/<meta name="twitter:title" content="[^"]*">/g, () => `<meta name="twitter:title" content="${title}">`);
      html = html.replace(/<meta property="og:description" content="[^"]*">/g, () => `<meta property="og:description" content="${desc}">`);
      html = html.replace(/<meta name="twitter:description" content="[^"]*">/g, () => `<meta name="twitter:description" content="${desc}">`);
      const imageUrl = `${url.origin}${thumbnail}`;
      html = html.replace(/<meta property="og:image" content="[^"]*">/g, () => `<meta property="og:image" content="${imageUrl}">`);
      html = html.replace(/<meta name="twitter:image" content="[^"]*">/g, () => `<meta name="twitter:image" content="${imageUrl}">`);
      html = html.replace(/<meta property="og:url" content="[^"]*">/g, () => `<meta property="og:url" content="${shareUrl}">`);
      html = html.replace(/<link rel="canonical" href="[^"]*">/g, () => `<link rel="canonical" href="${shareUrl}">`);
      html = html.replace(/<title>[^<]*<\/title>/g, () => `<title>${title}</title>`);

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    } catch (e) {
      // index.htmlの読み込みに失敗した場合はパススルー
      return next();
    }
  }

  return next();
}
