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
