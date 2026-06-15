export default async function handler(req, res) {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch YouTube search page');
    }

    const html = await response.text();
    
    // 1. YouTube のレンダリング用 JSON (ytInitialData) 内の "videoId" から抽出する（最も確実）
    const match = html.match(/"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/);
    if (match && match[1]) {
      return res.status(200).json({ videoId: match[1] });
    }

    // 2. フォールバック: 通常の /watch?v= リンクから抽出
    const watchMatch = html.match(/\/watch\?v=([A-Za-z0-9_-]{11})/);
    if (watchMatch && watchMatch[1]) {
      return res.status(200).json({ videoId: watchMatch[1] });
    }

    return res.status(404).json({ error: 'No video found' });
  } catch (error) {
    console.error('YouTube search error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
