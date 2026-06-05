// ============================================================
//  SLAPS — 接続設定
//  anon key はブラウザに出てOK（公開前提・RLSで守る鍵）。
//  空のままなら Supabase に繋がず、ローカル JSON + localStorage で動く。
// ============================================================
window.SLAPS_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
};
