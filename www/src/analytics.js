const FIRST_VISIT_KEY = 'slaps_first_visit_v1';
const RETURN_SENT_KEY = 'slaps_return_milestones_v2';
const SESSION_EVENTS = new Set();
const playedAfterStart = new Set();
let listeningStarted = false;
let fiveMinuteTimer = null;
let listenedMs = 0;
let lastSample = null;

export function analyticsDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

export function calendarDayDiff(from, to) {
  const start = analyticsDate(from);
  const end = analyticsDate(to);
  if (!start || !end) return 0;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 86400000));
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
    measurement_version: '2',
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
      if (days === milestone && !sent.has(milestone)) {
        trackEvent(`return_d${milestone}`, { days_since_first_visit: days, cohort_date: analyticsDate(first) });
        sent.add(milestone);
      }
    }
    localStorage.setItem(RETURN_SENT_KEY, JSON.stringify([...sent]));
  } catch {
    // Analytics must never block playback when storage is unavailable.
  }
}

export function noteStarted(song, mode = 'station', readPlayback = () => null) {
  if (listeningStarted) return;
  listeningStarted = true;
  trackOnce('start', { youtube_id: song?.youtube_id || null, mode });
  // START is intent. Only advancing, confirmed playback qualifies as listening.
  const sample = () => {
    try { samplePlayback(readPlayback()); } catch { notePlaybackState(false); }
  };
  sample();
  fiveMinuteTimer = setInterval(() => {
    sample();
    if (listenedMs < 300000) return;
    trackOnce('listen_5_minutes', { tracks_loaded: playedAfterStart.size });
  }, 1000);
}

export function notePlaybackState(playing) {
  if (!playing) lastSample = null;
}

export function noteTrackLoaded() {
  // Loading, buffering, errors and track switches must not count as playback.
  notePlaybackState(false);
}

export function samplePlayback(snapshot, now = performance.now()) {
  if (!listeningStarted) return;
  if (!snapshot?.playing || !snapshot.id || !Number.isFinite(snapshot.time)) {
    notePlaybackState(false);
    return;
  }
  const previous = lastSample;
  lastSample = { id: snapshot.id, time: snapshot.time, now };
  if (!previous || previous.id !== snapshot.id) return;
  const elapsed = now - previous.now;
  const advanced = (snapshot.time - previous.time) * 1000;
  // Ignore seeking, frozen players and throttled/suspended browser gaps.
  if (elapsed <= 0 || elapsed > 2500 || advanced <= 0 || advanced > elapsed * 1.5 + 250) return;
  listenedMs += Math.min(elapsed, advanced);
  playedAfterStart.add(snapshot.id);
  if (playedAfterStart.size >= 3) {
    trackOnce('track_3_reached', { mode: snapshot.mode || 'station' });
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
  listenedMs = 0;
  lastSample = null;
  if (fiveMinuteTimer) clearInterval(fiveMinuteTimer);
  fiveMinuteTimer = null;
}
