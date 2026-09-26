const MAX_PART_SECONDS = 12 * 60 * 60;

export function clampPartTime(value) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(0, Math.min(MAX_PART_SECONDS, seconds));
}

export function formatPartTime(value) {
  const seconds = clampPartTime(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function readPartRequest(search = '') {
  try {
    const params = new URLSearchParams(search);
    const youtubeId = params.get('v') || '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(youtubeId) || !params.has('t')) return null;
    return { youtubeId, seconds: clampPartTime(params.get('t')) };
  } catch {
    return null;
  }
}

export function buildPartUrl(origin, youtubeId, seconds) {
  const url = new URL('/', origin);
  url.searchParams.set('v', youtubeId);
  url.searchParams.set('t', String(clampPartTime(seconds)));
  return url.toString();
}
