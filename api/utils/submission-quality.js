const HIPHOP_TERMS = [
  /\bhip[ -]?hop\b/i,
  /\brap(?:per|ping)?\b/i,
  /\btrap\b/i,
  /\bdrill\b/i,
  /\bgrime\b/i,
  /\bboom[ -]?bap\b/i,
  /\bcypher\b/i,
  /\bfreestyle\b/i,
  /\bemcee\b/i,
  /(?:^|\s)mc(?:\s|$)/i,
];

export function normalizeTrackTitle(value = '') {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\[[^\]]*(official|music video|audio|lyrics?|visuali[sz]er|mv)[^\]]*\]/gi, ' ')
    .replace(/\([^)]*(official|music video|audio|lyrics?|visuali[sz]er|mv)[^)]*\)/gi, ' ')
    .replace(/\b(official\s+)?(music\s+)?video\b/gi, ' ')
    .replace(/\bofficial\s+audio\b/gi, ' ')
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function eraFromPublishDate(value = '') {
  const match = String(value).match(/^(19|20)\d{2}/);
  if (!match) return null;
  const year = Number(match[0]);
  if (year >= 1990 && year <= 1999) return '90s';
  if (year >= 2000 && year <= 2009) return '00s';
  if (year >= 2010 && year <= 2019) return '10s';
  if (year >= 2020 && year <= 2029) return '20s';
  return null;
}

export function assessHipHop(metadata = {}) {
  const category = String(metadata.category || '').trim().toLowerCase();
  if (category && category !== 'music') {
    return { confident: false, reason: 'youtube_category_not_music', signals: [] };
  }
  const text = [
    metadata.title,
    metadata.author_name,
    metadata.shortDescription,
    ...(Array.isArray(metadata.keywords) ? metadata.keywords : []),
  ].filter(Boolean).join(' ');
  const signals = HIPHOP_TERMS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  return {
    confident: signals.length > 0,
    reason: signals.length > 0 ? 'hiphop_metadata_signal' : 'hiphop_metadata_uncertain',
    signals,
  };
}

export function findTitleDuplicate(title, songs = []) {
  const normalized = normalizeTrackTitle(title);
  if (!normalized) return null;
  return songs.find((song) => normalizeTrackTitle(song && song.name) === normalized) || null;
}
