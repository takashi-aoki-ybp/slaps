const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const lsPush = (k, v) => {
  const a = lsGet(k);
  a.unshift(v);
  const MAX_LS_ITEMS = 500;
  while (a.length > MAX_LS_ITEMS) a.pop();
  try { localStorage.setItem(k, JSON.stringify(a)); } catch { /* quota exceeded — silently drop */ }
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 5000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const db = {
  live: true,
  lsGet,
  lsPush,

  async loadSongs() {
    try {
      const res = await fetchWithTimeout('/api/songs');
      if (!res.ok) throw new Error('API response not OK');
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('API returned invalid data format');
      return data;
    } catch (e) {
      console.warn('API load failed, falling back to local JSON and localStorage:', e);
      const localRes = await fetchWithTimeout('/data/songs.json');
      if (!localRes.ok) throw new Error('Local songs response not OK');
      const songs = await localRes.json();
      const mine = lsGet('slaps_submissions');
      const brokenIds = new Set(lsGet('slaps_broken').map((b) => b.youtube_id));
      return [...mine, ...songs].filter((s) => !brokenIds.has(s.youtube_id));
    }
  },

  async submit(song) {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(song)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((data && data.error) || 'Submit failed');
    }
    return data;
  },

  async report(r) {
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r)
    });
    if (!res.ok) throw new Error('Report failed');
  },

  async markBroken(id, code) {
    const res = await fetch('/api/mark_broken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_id: id, code })
    });
    if (!res.ok) throw new Error('Mark broken failed');
  },
};
