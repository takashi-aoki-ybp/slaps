# START handoff — v3.47

## Current acceptance: no opening-text / START overlap

The user rejected v3.46 because the opening copy remained behind START.
The correct handoff is now: retain minimum text hold/playback readiness →
fade the three opening text elements out together for400ms → explicitly hide
that text group and start START's400ms fade-in → reveal the background with
the existing1.6s fade once START is opaque. The background stays opaque during
both text/button transitions, so the iframe control cannot appear between them.

The initial copy/layout is unchanged; a wrapper separates copy opacity from
background opacity. No frame may show the old text and a visible START together.
Buffering before text exit restores text without showing START; after START
appears, the departed text must never come back over it. The retry button has
space below START when the text has already gone. Early START and re-muting
after START do not reopen the entry gate (audio state is not entry permission).

The13-case regression suite retains previous gates and adds cancellation before
text exit and re-muting after entry. Against9cf84a9 it fails6 cases. Real-browser
verification records text-fade opacity, text hidden before START, and zero
text/START overlap on every captured rendered frame; unit cases cover rebuffer guards.
The v3.45/v3.46 results below are historical, superseded where they permit overlap.

## Follow-up: START fade-in — v3.46

The user additionally requested START itself fade in rather than appear
instantly. Replace v3.45's150ms abrupt-appearance lead with a400ms opacity
animation and450ms lead. Keep the opening fully opaque during that fade-in;
only after START is opaque does the opening begin its existing1.6s fade.
The older v3.45 measurements below remain historical.

This is an explicit timing-oracle update: retained all11 cases, adding assertions
that the opening has NOT begun fading during START's400ms entrance. Adapted
completion clock points by the extra300ms, without removing failure/skip/retry
or early-click assertions. The old2aee76d source fails the two new timing
assertions. Real-browser verification additionally measures intermediate START
opacity, fully opaque opening at that instant, and START opacity1 when the
opening fade starts. Same-video audio unlock and all other UI stay unchanged.

The initial live probe twice sampled opacity after locator polling had already
missed the400ms window. Its captured mutation trace showed0 →0.488 →0.877 while
the opening stayed at1. The verifier now records rendered frames with rAF and
asserts those intermediate values instead of relying on a late120ms sleep.
The fade/opaque-opening assertions are retained, not bypassed.

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

## v3.46 production acceptance (supersedes v3.45 timing above)

- READY / production / https://slaps.tokyo/ and www, both aliases assigned.
- Source9cf84a9247154ae4609f3937185281f21c0a0610; deployment
  dpl_2C9vf6AKZktKL9GPfAwT67G5qvzi /
  https://slaps-8f3vxptgz-takashi-aokis-projects.vercel.app.
  Static frontend + Vercel Node APIs; build4s / deploy24s.
- npm run verify,11 intro cases, Android asset sync and GitHub
  CI33764143970 /33764138352 PASS. Old2aee76d fails both fade-in gate checks.
- Actual public six-case coverage PASS: PC/mobile, early/mobile-early START,
  delayed iframe and blocked API/retry. Captured intermediate START opacity
  >0 and<1 with opening opacity1, then START opacity1 before opening fade.
  Lead450–501ms, opening fade1601–1602ms, pageerror0. Early click continues
  the same video and does not re-show START after the opening.
- Mobile early-click's first NEXT probe hit the existing idle-hidden UI after
  waiting. Retested with real pointer movement to wake UI before NEXT; no
  forced click and no change to the app's idle behavior. First three and last
  three successful runs are merged in production-evidence.json by unique mode.
- SW-enabled reload PASS with slaps-v3.46 cache/controller/current CSS,
  advancing muted video and centered START. Full public SHUFFLE/DIG acceptance
  rerun PASS (1011/full pool, eight draws, fr90s cycle/PREV-NEXT, LATEST/DAILY,
  mobile DIG). All owned process-muted test browsers closed.
- Five public assets match candidate bytes; complete1011-track API payload
  unchanged. No DB, song, analytics, DIG or iframe configuration edits.
- Post-deploy10m log scan:1 known DEP0169 warning at /api/og-image, HTTP200.
  No new monitoring/drain configuration; physical devices not tested.
- Rollback:v3.45 / dpl_BGAswEwkxahias5HHkP5GnAF8nks. main unchanged.
- Evidence:outputs/start-layer-20260903/ plus /tmp/slaps-start-fade-*.log and
  /tmp/slaps-start-fade-errors.jsonl. v3.45 screenshots/JSON were refreshed by
  v3.46 checks; the v3.45 timing results above retain their historical values.

## v3.47 production result — no text/START overlap

- URL:https://slaps.tokyo/ (www alias also explicitly set).
- Target:production; Status:READY; source3d945e681fd8759f9b2418f269ed487ec4b50ca7.
- Deployment:dpl_Bn8JxG8FMkfK1RDZgPy2SYuXxGGu /
  https://slaps-a2ylbix5h-takashi-aokis-projects.vercel.app.
- Static frontend + Vercel Node APIs; build4s / deploy19s; Web/PWA3.47,
  Android347 Web assets synced. No physical mobile-device claim.
- npm run verify/13 intro cases/CI33765319851 and33765324198 PASS;
  old9cf84a9 fails6 cases. No existing failure/skip/retry/promo checks removed.
- Public normal/mobile/early/mobile-early/iframe-delay/API-block-retry all
  PASS. Every captured frame with visible START has opening-copy opacity0;
  copy fade-out and START fade-in each have intermediate opacity samples.
  START stays above an opaque background until fully visible. Lead451–452ms,
  background fade1600–1602ms; early clicks retain the same video; pageerror0.
- Public PC/mobile screenshots visually inspected: the three old text elements
  are gone when START is visible. The prior v3.46 verifier checked START alone
  and missed this composition requirement; the explicit no-overlap oracle now
  rejects that former behavior.
- SW-enabled reload PASS (slaps-v3.47/controller/current CSS/muted moving video).
  Public SHUFFLE/DIG full acceptance PASS:1011 candidates, eight draws,
  fr90s4-track cycle/PREV-NEXT, LATEST/DAILY and mobile DIG.
- Five public assets match source; complete1011-track API payload unchanged.
  No song/submission/analytics/selection/DIG/iframe-parameter changes.
- Post-deploy10m log scan:one existing DEP0169 warning /api/og-image, HTTP200.
  No new monitoring/drain configuration. Owned process-muted browsers closed;
  synthetic analytics and same-origin non-GET requests intercepted.
- Rollback:v3.46 /dpl_2C9vf6AKZktKL9GPfAwT67G5qvzi. main unchanged.
- Evidence:outputs/start-layer-20260903/ now contains v3.47 results/images;
  /tmp/slaps-handoff-*.log and /tmp/slaps-handoff-errors.jsonl.
