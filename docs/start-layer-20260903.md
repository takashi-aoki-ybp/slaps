# START handoff — v3.45

## Acceptance contract / explicit oracle change

The user reported the pause control appearing before START and explicitly asked
for START above the opening FIRST. This supersedes only v3.44's ordering
(`fade -> START`), not its playback gate, minimum text hold or slow fade.
Codex is the sole writer; deterministic tests and real Chrome are the checkers.

- Keep the opening for >=2.6s (except explicit skip) and require the current
  muted video's time to advance steadily for 800ms.
- Show an opaque, centered START above the opening (z51 > z50). Give it 150ms
  before starting the existing 1.6s opening fade. Mobile also uses center50%,
  replacing its previous38% position so it covers the central control.
- Keep START present across the fade, including a cancelled fade on buffering.
- Allow early START clicks. Finish fading, never re-show START or auto-mute
  after audio unlock, and retain the same video.
- Preserve error/retry and promo mode, all music/user data, analytics, SHUFFLE,
  DIG, other UI, and iframe parameters. No report is sent to YouTube.
- This covers the pre-START handoff, not every later YouTube overlay.

## Tests

Updated the two explicit timing expectations and buffering handoff assertion
to the new user-requested behavior, retaining all readiness/failure/skip/promo
checks. Added early-unlock and buffered-handoff cases:11 pass. The same suite
against f613a84 (v3.44) fails5 cases, confirming the reported gap is detected.
An initial test used the wrong late-start poll instant (7200 vs7050ms); corrected
the test clock observation, retaining both pre-fade and post-fade assertions.

Real browser driver: `outputs/start-layer-20260903/browser.cjs`. Process-muted
Chrome, synthetic analytics and same-origin non-GET intercepted. It checks
actual computed stacking/opaque color/viewport-center hit testing, a recorded
START-first interval, fade duration, early click/same video/unmute/no resurrection,
NEXT and page errors. Normal/mobile screenshots are visually inspected.
Mobile coverage is viewport emulation, not physical iOS/Android verification.

Previous uncommitted PC-control investigation files remain untouched and are
not included in this release. Native Android API issues remain separate;
only Web assets/version are synchronized here.

## Candidate verification

- `npm run verify`: PASS, including11 intro cases and all existing suites.
- `npm run android:sync`: PASS (assets/version only).
- Actual normal/mobile/early-click/mobile-early/iframe6s-delay/API-block-retry:
  PASS, pageerror0. START-first lead150–152ms, fade1601–1602ms. Normal hold2725–2728ms;
  delayed iframe7563ms; blocked API retry recovered14959ms.
- Normal and mobile fade/ready screenshots inspected: opaque START is above
  the fading logo and covers the center, with no exposed pause icon beforehand.
- Process-muted test browsers closed; no same-origin production writes allowed.

## Deploy Result

- URL: https://slaps.tokyo/ (www alias also assigned explicitly).
- Target: production. Status: READY. Web/PWA3.45 / Android assets345.
- Source commit:2aee76d1f425d85aa8accce131cefe69b95383cf.
- Framework: static frontend + Vercel Node APIs. Build:5s, total deploy26s.
- Deployment:dpl_BGAswEwkxahias5HHkP5GnAF8nks.
- Deployment URL:https://slaps-1hpflf1ty-takashi-aokis-projects.vercel.app.
- Rollback:v3.44 / dpl_H23FVd7TaxTzZTkiqLrajCZXGz3H.
- GitHub CI33763196250 and33763192360 passed; main unchanged.

## Public acceptance

- The six real-browser cases all PASS: normal/mobile, early/mobile-early,
  iframe6s-delay and API-block-retry. pageerror0, center covered throughout,
  START lead151–152ms, fade1601–1602ms. Text hold2725–2730ms normally;
  delayed iframe7566ms, API retry14204ms. START retained the video and unmuted it.
- Five public assets byte-match the candidate. Public API1011 tracks /1011
  unique IDs, complete payload identical before/after; no song/DB changes.
- SW-enabled reload PASS: slaps-v3.45/controller active, current3.45 CSS,
  moving muted video, START covers center.
- Post-deploy10m error scan:1 existing DEP0169 url.parse warning at
  /api/og-image, response200. Not a claim of zero error-level logs.
  No new drains or monitoring configuration changes.
- Evidence:outputs/start-layer-20260903/production-evidence.json,
  public-parity.json, *-fading.png/*-ready.png, /tmp/slaps-start-reload.log,
  /tmp/slaps-start-deploy.log and /tmp/slaps-start-errors.jsonl.
- Public SHUFFLE/DIG acceptance also PASS:1011/full pool, eight SHUFFLE
  clicks, fr/90s four-track cycle and reversible PREV/NEXT, LATEST/DAILY,
  mobile DIG, pageerror0. Evidence:/tmp/slaps-start-production-shuffle.log.
  All owned verification browsers have been closed.
