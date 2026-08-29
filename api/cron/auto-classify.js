export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const expected = process.env.CRON_SECRET;
  const authorization = String(req.headers.authorization || '');

  // Missing configuration must fail closed. This retired endpoint is also no
  // longer scheduled in vercel.json, so it cannot rewrite the song catalogue.
  if (!expected || authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.status(410).json({
    error: 'Auto-classification is retired. Curated metadata is managed through the review workflow.',
  });
}
