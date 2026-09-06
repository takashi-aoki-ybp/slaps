export function songDate(song) {
  const value = song?.created_at || song?.publish_at || '';
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function jstDateKey(value = new Date()) {
  const shifted = new Date(value.getTime() + (9 * 60 * 60 * 1000));
  return shifted.toISOString().slice(0, 10);
}

export function buildDailyArchive(songs, limit = 10) {
  const groups = new Map();
  for (const song of songs || []) {
    if (String(song?.user_name || '').toUpperCase() !== 'SLAPS') continue;
    const date = songDate(song);
    if (!date) continue;
    if (!groups.has(date)) groups.set(date, []);
    const tracks = groups.get(date);
    if (tracks.length < limit && !tracks.some((track) => track.youtube_id === song.youtube_id)) {
      tracks.push(song);
    }
  }
  return [...groups.entries()]
    .map(([date, tracks]) => ({ date, tracks }))
    .filter((entry) => entry.tracks.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function dailyShareUrl(origin, date) {
  const url = new URL('/', origin);
  url.searchParams.set('daily', date);
  return url.toString();
}
