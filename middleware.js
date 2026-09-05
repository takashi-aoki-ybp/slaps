function next() {
  return new Response(null, {
    headers: {
      'x-middleware-next': '1'
    }
  });
}

// API routes do not need page metadata rewriting. Keeping them out of the
// middleware path also avoids adding Edge runtime work to every API request.
export const config = {
  matcher: ['/((?!api/).*)'],
};

// クローラー判定用の正規表現
const BOT_UA_REGEX = /bot|crawl|spider|facebook|twitter|slack|discord|whatsapp|telegram|line|pinterest/i;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export default async function middleware(request) {
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';

  // 拡張子（.css, .js, 画像等）および /api/ へのリクエストは無視
  if (url.pathname.startsWith('/api/') || (url.pathname.includes('.') && !url.pathname.endsWith('.html'))) {
    return next();
  }

  const rawVideoId = url.searchParams.get('v') || '';
  const videoId = /^[A-Za-z0-9_-]{11}$/.test(rawVideoId) ? rawVideoId : '';
  const dailyDate = String(url.searchParams.get('daily') || '');
  const crateIds = String(url.searchParams.get('crate') || '')
    .split('.')
    .filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id))
    .filter((id, index, all) => all.indexOf(id) === index)
    .slice(0, 50);

  if (/^\d{4}-\d{2}-\d{2}$/.test(dailyDate) && BOT_UA_REGEX.test(userAgent)) {
    try {
      const indexRes = await fetch(new URL('./index.html', request.url));
      let html = await indexRes.text();
      const title = `TODAY'S 10 · ${dailyDate} · SLAPS`;
      const desc = `Listen to the SLAPS DAILY DROP for ${dailyDate}.`;
      const shareUrl = `${url.origin}/?daily=${dailyDate}`;
      const imageUrl = `${url.origin}/api/daily-og?date=${dailyDate}`;
      html = html.replace(/<meta property="og:title" content="[^"]*">/g, () => `<meta property="og:title" content="${escapeHtml(title)}">`);
      html = html.replace(/<meta name="twitter:title" content="[^"]*">/g, () => `<meta name="twitter:title" content="${escapeHtml(title)}">`);
      html = html.replace(/<meta property="og:description" content="[^"]*">/g, () => `<meta property="og:description" content="${escapeHtml(desc)}">`);
      html = html.replace(/<meta name="twitter:description" content="[^"]*">/g, () => `<meta name="twitter:description" content="${escapeHtml(desc)}">`);
      html = html.replace(/<meta property="og:image" content="[^"]*">/g, () => `<meta property="og:image" content="${escapeHtml(imageUrl)}">`);
      html = html.replace(/<meta name="twitter:image" content="[^"]*">/g, () => `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`);
      html = html.replace(/<meta property="og:url" content="[^"]*">/g, () => `<meta property="og:url" content="${escapeHtml(shareUrl)}">`);
      html = html.replace(/<link rel="canonical" href="[^"]*">/g, () => `<link rel="canonical" href="${escapeHtml(shareUrl)}">`);
      html = html.replace(/<title>[^<]*<\/title>/g, () => `<title>${escapeHtml(title)}</title>`);
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
    } catch { return next(); }
  }

  // 保存曲の共有は、クローラー向けに曲数と専用画像を含むOGPを返す
  if (crateIds.length && BOT_UA_REGEX.test(userAgent)) {
    try {
      const indexUrl = new URL('./index.html', request.url);
      const indexRes = await fetch(indexUrl);
      let html = await indexRes.text();
      const crate = crateIds.join('.');
      const count = crateIds.length;
      const title = `${count} SAVED TRACK${count === 1 ? '' : 'S'} · SLAPS`;
      const desc = `Listen to ${count} tracks shared on SLAPS.`;
      const shareUrl = `${url.origin}/?crate=${crate}`;
      const imageUrl = `${url.origin}/api/crate-og?crate=${crate}`;

      html = html.replace(/<meta property="og:title" content="[^"]*">/g, () => `<meta property="og:title" content="${escapeHtml(title)}">`);
      html = html.replace(/<meta name="twitter:title" content="[^"]*">/g, () => `<meta name="twitter:title" content="${escapeHtml(title)}">`);
      html = html.replace(/<meta property="og:description" content="[^"]*">/g, () => `<meta property="og:description" content="${escapeHtml(desc)}">`);
      html = html.replace(/<meta name="twitter:description" content="[^"]*">/g, () => `<meta name="twitter:description" content="${escapeHtml(desc)}">`);
      html = html.replace(/<meta property="og:image" content="[^"]*">/g, () => `<meta property="og:image" content="${escapeHtml(imageUrl)}">`);
      html = html.replace(/<meta name="twitter:image" content="[^"]*">/g, () => `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`);
      html = html.replace(/<meta property="og:url" content="[^"]*">/g, () => `<meta property="og:url" content="${escapeHtml(shareUrl)}">`);
      html = html.replace(/<link rel="canonical" href="[^"]*">/g, () => `<link rel="canonical" href="${escapeHtml(shareUrl)}">`);
      html = html.replace(/<title>[^<]*<\/title>/g, () => `<title>${escapeHtml(title)}</title>`);

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch (_) {
      return next();
    }
  }

  // 動画IDがあり、かつクローラーからのアクセスの時のみOGPをインジェクト
  if (videoId && BOT_UA_REGEX.test(userAgent)) {
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    let songName = "";
    let thumbnail = `/api/og-image?v=${videoId}&ext=.jpg`;

    if (kvUrl && kvToken) {
      try {
        const res = await fetch(kvUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${kvToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(['LRANGE', `${process.env.DB_PREFIX || ''}slaps:songs`, 0, -1])
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

    const title = "Play on SLAPS";
    const desc = songName ? `Play on SLAPS | ${songName}` : "Nothing but slaps. An online station dedicated to HIPHOP.";


    // 元の index.html をフェッチ
    try {
      const indexUrl = new URL('./index.html', request.url);
      const indexRes = await fetch(indexUrl);
      let html = await indexRes.text();

      // OGPタグを置換
      const shareUrl = `${url.origin}/?v=${videoId}`;
      html = html.replace(/<meta property="og:title" content="[^"]*">/g, () => `<meta property="og:title" content="${escapeHtml(title)}">`);
      html = html.replace(/<meta name="twitter:title" content="[^"]*">/g, () => `<meta name="twitter:title" content="${escapeHtml(title)}">`);
      html = html.replace(/<meta property="og:description" content="[^"]*">/g, () => `<meta property="og:description" content="${escapeHtml(desc)}">`);
      html = html.replace(/<meta name="twitter:description" content="[^"]*">/g, () => `<meta name="twitter:description" content="${escapeHtml(desc)}">`);
      const imageUrl = `${url.origin}${thumbnail}`;
      html = html.replace(/<meta property="og:image" content="[^"]*">/g, () => `<meta property="og:image" content="${escapeHtml(imageUrl)}">`);
      html = html.replace(/<meta name="twitter:image" content="[^"]*">/g, () => `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`);
      html = html.replace(/<meta property="og:url" content="[^"]*">/g, () => `<meta property="og:url" content="${escapeHtml(shareUrl)}">`);
      html = html.replace(/<link rel="canonical" href="[^"]*">/g, () => `<link rel="canonical" href="${escapeHtml(shareUrl)}">`);
      html = html.replace(/<title>[^<]*<\/title>/g, () => `<title>${escapeHtml(title)}</title>`);

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
