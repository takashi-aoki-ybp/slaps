const cfg = window.SLAPS_CONFIG || {};
const live = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
const sb = live ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const lsPush = (k, v) => {
  const a = lsGet(k);
  a.unshift(v);
  const MAX_LS_ITEMS = 500;
  while (a.length > MAX_LS_ITEMS) a.pop();
  try { localStorage.setItem(k, JSON.stringify(a)); } catch { /* quota exceeded — silently drop */ }
};

export const db = {
  live,
  lsGet,
  lsPush,
  async loadSongs() {
    if (live) {
      const controller = new AbortController();
      const signal = controller.signal;
      const query = sb
        .from('songs')
        .select('youtube_id,name,description,user_name,region,era,thumbnail,conscious_turnt,created_at,publish_at')
        .eq('status', 'published')
        .eq('unplayable', false)
        .limit(5000)
        .abortSignal(signal);
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const { data, error } = await query;
        clearTimeout(timer);
        if (error) { /* loadSongs failed, falling back to JSON */ }
        else return data;
      } catch (_) {
        clearTimeout(timer);
      }
    }
    const songs = await fetch('./data/songs.json').then((r) => r.json());
    const mine = lsGet('slaps_submissions');
    const brokenIds = new Set(lsGet('slaps_broken').map((b) => b.youtube_id));
    return [...mine, ...songs].filter((s) => !brokenIds.has(s.youtube_id));
  },

  async submit(song) {
    if (live) {
      const { data, error } = await sb.rpc('submit_song', {
        p_youtube_id: song.youtube_id,
        p_name: song.name,
        p_region: song.region,
        p_era: song.era,
        p_user_name: song.user_name,
        p_description: song.description,
        p_thumbnail: song.thumbnail,
        p_conscious_turnt: song.conscious_turnt,
      });
      if (error) throw error;
      return data;
    }
    lsPush('slaps_submissions', song);
    return song;
  },

  async report(r) {
    if (live) {
      const { error } = await sb.rpc('report_song', {
        p_youtube_id: r.youtube_id,
        p_song_name: r.name,
        p_reason: r.reason,
        p_note: r.note,
      });
      if (error) throw error;
      return;
    }
    lsPush('slaps_reports', r);
  },

  async markBroken(id, code) {
    if (live) {
      const { error } = await sb.rpc('mark_broken', { p_youtube_id: id, p_code: code });
      if (error) { /* mark_broken failed */ }
      return;
    }
    const arr = lsGet('slaps_broken');
    arr.push({ youtube_id: id, code, at: new Date().toISOString() });
    try { localStorage.setItem('slaps_broken', JSON.stringify(arr)); } catch { /* quota exceeded */ }
  },
};
