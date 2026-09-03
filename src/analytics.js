const FIRST_VISIT_KEY = 'slaps_first_visit_v1';
const RETURN_SENT_KEY = 'slaps_return_milestones_v1';
const SESSION_EVENTS = new Set();
const playedAfterStart = new Set();
let listeningStarted = false;
let fiveMinuteTimer = null;
let playbackActive = false;
let playbackStartedAt = 0;
let listenedMs = 0;

export function calendarDayDiff(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

export function sanitizeProps(props = {}) {
  return Object.fromEntries(Object.entries(props).filter(([, value]) =>
    value == null || ['string', 'number', 'boolean'].includes(typeof value)));
}

export function trackEvent(name, props = {}) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: `slaps_${String(name).replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`,
    ...sanitizeProps(props),
  });
}

export function trackOnce(name, props = {}) {
  if (SESSION_EVENTS.has(name)) return;
  SESSION_EVENTS.add(name);
  trackEvent(name, props);
}

export function initAnalytics(now = new Date()) {
  trackOnce('app_view');
  try {
    const firstRaw = localStorage.getItem(FIRST_VISIT_KEY);
    const first = firstRaw ? new Date(firstRaw) : null;
    if (!first || Number.isNaN(first.getTime())) {
      localStorage.setItem(FIRST_VISIT_KEY, now.toISOString());
      return;
    }
    const days = calendarDayDiff(first, now);
    const sent = new Set(JSON.parse(localStorage.getItem(RETURN_SENT_KEY) || '[]'));
    for (const milestone of [1, 7]) {
      if (days >= milestone && !sent.has(milestone)) {
        trackEvent(`return_d${milestone}`, { days_since_first_visit: days });
        sent.add(milestone);
      }
    }
    localStorage.setItem(RETURN_SENT_KEY, JSON.stringify([...sent]));
  } catch {
    // Analytics must never block playback when storage is unavailable.
  }
}

export function noteStarted(song, mode = 'station') {
  if (listeningStarted) return;
  listeningStarted = true;
  trackOnce('start', { youtube_id: song?.youtube_id || null, mode });
  noteTrackLoaded(song, mode);
  notePlaybackState(true);
  fiveMinuteTimer = setInterval(() => {
    const total = listenedMs + (playbackActive ? Date.now() - playbackStartedAt : 0);
    if (total < 300000) return;
    trackOnce('listen_5_minutes', { tracks_loaded: playedAfterStart.size });
    clearInterval(fiveMinuteTimer);
    fiveMinuteTimer = null;
  }, 5000);
}

export function notePlaybackState(playing) {
  if (!listeningStarted || playbackActive === playing) return;
  const now = Date.now();
  if (playbackActive) listenedMs += Math.max(0, now - playbackStartedAt);
  playbackActive = playing;
  playbackStartedAt = playing ? now : 0;
}

export function noteTrackLoaded(song, mode = 'station') {
  if (!listeningStarted || !song?.youtube_id) return;
  playedAfterStart.add(song.youtube_id);
  if (playedAfterStart.size >= 3) {
    trackOnce('track_3_reached', { mode });
  }
}

export function analyticsMode(state) {
  if (state?.dailyMode) return 'daily';
  if (state?.crateMode) return 'crate';
  if (state?.favMode) return 'favorites';
  return state?.order === 'newest' ? 'latest' : 'shuffle';
}

export function resetAnalyticsForTests() {
  SESSION_EVENTS.clear();
  playedAfterStart.clear();
  listeningStarted = false;
  playbackActive = false;
  playbackStartedAt = 0;
  listenedMs = 0;
  if (fiveMinuteTimer) clearInterval(fiveMinuteTimer);
  fiveMinuteTimer = null;
}
