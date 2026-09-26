# THIS PART preview verification contract

Status: active preview contract
Target: Vercel Preview only. Production aliases must not be changed.

## Product contract

- `THIS PART` captures the current playback second without pausing or copying the video.
- The share URL contains only the current YouTube ID and a bounded integer timestamp.
- Opening a shared URL selects that track and seeks once to the shared timestamp while preserving the muted opening and START audio-permission flow.
- The optional note is included in share text only. It is not stored and is not placed in the URL.
- The overlay is fixed to the viewport, does not change document height, and closes by its close button, CANCEL, backdrop click, or Escape.
- The trigger and overlay work with keyboard focus and at desktop, 390px, and 320px widths.

## Visual contract

- Existing SLAPS composition and full-bleed video remain the visual foundation.
- Site chrome uses black, white, neutral grays, and the DIG fluorescent yellow `#e0f850` only.
- Legacy blue, red, green, pink, and gold accent literals are removed from the app UI.
- `THIS PART` and DIG share the halftone sticker grammar without becoming identical controls.
- Motion communicates the sticker-to-drawer relationship and is disabled for `prefers-reduced-motion`.

## Regression contract

- Opening muted playback, START handoff, SHUFFLE/LATEST, DIG, DAILY, save, submit, and report markup remain intact.
- No song data, API persistence, Redis data, or production configuration is changed.
- `npm run verify`, `npm run android:verify`, browser console/page-error checks, and responsive screenshots must pass before the preview is handed off.
