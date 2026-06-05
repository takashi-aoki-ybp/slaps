function next() {
  return new Response(null, {
    headers: {
      'x-middleware-next': '1'
    }
  });
}

// クローラー判定用の正規表現
const BOT_UA_REGEX = /bot|crawl|spider|facebook|twitter|slack|discord|whatsapp|telegram/i;

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
    // Supabaseの環境変数を確認
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    let songName = "";
    let thumbnail = `/api/og-image?v=${videoId}`;

    if (supabaseUrl && supabaseKey) {
      try {
        // Supabase REST API を直接叩いて高速取得
        const res = await fetch(
          `${supabaseUrl}/rest/v1/songs?youtube_id=eq.${videoId}&select=name`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            }
          }
        );
        const data = await res.json();
        if (data && data.length > 0) {
          songName = data[0].name;
        }
      } catch (e) {
        // Supabase取得失敗時
      }
    } else {
      // ローカル json へのフォールバック（Edge内でのfetch）
      try {
        const jsonUrl = new URL('./data/songs.json', request.url);
        const res = await fetch(jsonUrl);
        const songs = await res.json();
        const song = songs.find(s => s.youtube_id === videoId);
        if (song) {
          songName = song.name;
        }
      } catch (e) {
        // フォールバック失敗時
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
      html = html.replace(/<meta property="og:title" content="[^"]*">/g, `<meta property="og:title" content="${title}">`);
      html = html.replace(/<meta name="twitter:title" content="[^"]*">/g, `<meta name="twitter:title" content="${title}">`);
      html = html.replace(/<meta property="og:description" content="[^"]*">/g, `<meta property="og:description" content="${desc}">`);
      html = html.replace(/<meta name="twitter:description" content="[^"]*">/g, `<meta name="twitter:description" content="${desc}">`);
      const imageUrl = `${url.origin}${thumbnail}`;
      html = html.replace(/<meta property="og:image" content="[^"]*">/g, `<meta property="og:image" content="${imageUrl}">`);
      html = html.replace(/<meta name="twitter:image" content="[^"]*">/g, `<meta name="twitter:image" content="${imageUrl}">`);
      html = html.replace(/<meta property="og:url" content="[^"]*">/g, `<meta property="og:url" content="${shareUrl}">`);
      html = html.replace(/<link rel="canonical" href="[^"]*">/g, `<link rel="canonical" href="${shareUrl}">`);
      html = html.replace(/<title>[^<]*<\/title>/g, `<title>${title}</title>`);

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
