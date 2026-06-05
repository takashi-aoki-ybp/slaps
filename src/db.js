const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const lsPush = (k, v) => {
  const a = lsGet(k);
  a.unshift(v);
  const MAX_LS_ITEMS = 500;
  while (a.length > MAX_LS_ITEMS) a.pop();
  try { localStorage.setItem(k, JSON.stringify(a)); } catch { /* quota exceeded — silently drop */ }
};

export const db = {
  live: true,
  lsGet,
  lsPush,

  async loadSongs() {
    try {
      const res = await fetch('/api/songs');
      if (!res.ok) throw new Error('API response not OK');
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('API returned invalid data format');
      return data;
    } catch (e) {
      console.warn('API load failed, falling back to local JSON and localStorage:', e);
      const songs = await fetch('./data/songs.json').then((r) => r.json());
      const mine = lsGet('slaps_submissions');
      const brokenIds = new Set(lsGet('slaps_broken').map((b) => b.youtube_id));
      return [...mine, ...songs].filter((s) => !brokenIds.has(s.youtube_id));
    }
  },

  async submit(song) {
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(song)
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Submit failed');
      }
      const data = await res.json();
      return data.song || song;
    } catch (e) {
      console.warn('API submit failed, falling back to localStorage:', e);
      lsPush('slaps_submissions', song);
      return song;
    }
  },

  async report(r) {
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r)
      });
      if (!res.ok) throw new Error('Report failed');
    } catch (e) {
      console.warn('API report failed, falling back to localStorage:', e);
      lsPush('slaps_reports', r);
    }
  },

  async markBroken(id, code) {
    try {
      const res = await fetch('/api/mark_broken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_id: id, code })
      });
      if (!res.ok) throw new Error('Mark broken failed');
    } catch (e) {
      console.warn('API markBroken failed, falling back to localStorage:', e);
      const arr = lsGet('slaps_broken');
      arr.push({ youtube_id: id, code, at: new Date().toISOString() });
      try { localStorage.setItem('slaps_broken', JSON.stringify(arr)); } catch { /* quota exceeded */ }
    }
  },
};

