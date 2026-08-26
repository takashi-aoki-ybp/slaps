const [action = 'list', youtubeId = '', ...reasonParts] = process.argv.slice(2);
const endpoint = process.env.SLAPS_ADMIN_URL || 'https://slaps.tokyo/api/admin/submissions';
const token = process.env.SLAPS_ADMIN_TOKEN;

if (!token) {
  console.error('SLAPS_ADMIN_TOKEN is required.');
  process.exit(1);
}
if (!['list', 'approve', 'reject'].includes(action)) {
  console.error('Usage: npm run submissions -- list | approve <youtube_id> | reject <youtube_id> [reason]');
  process.exit(1);
}
if (action !== 'list' && !/^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
  console.error('A valid YouTube ID is required.');
  process.exit(1);
}

(async () => {
  const response = await fetch(endpoint, {
    method: action === 'list' ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: action === 'list' ? undefined : JSON.stringify({
      action,
      youtube_id: youtubeId,
      reason: reasonParts.join(' '),
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && data.error) || `HTTP ${response.status}`);
  }
  console.log(JSON.stringify(data, null, 2));
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
