export default function handler(req, res) {
  // キャッシュさせないように設定
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Content-Type', 'application/javascript');
  
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || '';
  
  res.status(200).send(`
    window.SLAPS_CONFIG = {
      SUPABASE_URL: '${url}',
      SUPABASE_ANON_KEY: '${key}'
    };
  `);
}
