# Player/SHUFFLE release acceptance

## Why this exists

The pre-v3.41 implementation prioritized tracks using persisted load history
and reused a queue on later cycles. General playback/build checks did not test
that selection policy. The failure was a mismatch between the intended random
discovery experience and the acceptance tests, not a lack of random-number calls.

Do not describe this as an approved personalization feature or infer that all
analytics are prohibited. Do not blame a user's browser/history without evidence.

## Automated checks — required on every change

`npm run verify` must pass without weakening its checks. `npm test` includes:

- `test-shuffle.js`: equal weighting, catalog-scale pool completeness, history
  independence, immediate-repeat exception, fresh cycles, reversible PREV/NEXT,
  empty/single pool, filters, favorites, LATEST, DAILY and shared-list ordering.
- `test-shuffle-guards.js`: verifies that the regression suite rejects deliberate
  reintroductions of history weighting, missing shuffle, fixed cycles, removed
  repeat protection, catalog truncation, stale displayed count, and reversed
  LATEST sorting. Mutations run in memory only; no app files or data are changed.

The existing GitHub CI runs `npm test`, builds, and checks generated-file sync.
These checks are not a technical lock against a direct Vercel CLI deployment.
Do not claim that all release paths are automatically blocked.

## Real UI — required for changes to player, queue, filters, or integration

- Confirm target version/commit and source asset parity.
- On a fresh browser and one carrying old load-history values: ALL/ALL should
  use the full live catalog. Click SHUFFLE repeatedly; no hidden short pool or
  immediate duplicate. Verify displayed count equals eligible pool count.
- Use a small real region/era pool and drive NEXT through a complete cycle;
  verify a new shuffle draw and the same candidate set. PREV/NEXT across the
  boundary must return to the corresponding tracks.
- Check filters, favorites, DAILY/shared list → SHUFFLE, and LATEST refresh.
  Account for real dialogs explicitly; do not force clicks through overlays.
- Opening: muted video time advances. START continues that same video.
- PC: UI is initially pinned but the central play/pause button is hidden.
  Repeat pause/resume at least three times and inspect the rendered YouTube
  frame as well as SLAPS `#playBtn` and transient `#tapIndicator`. A hidden
  SLAPS button alone is not acceptance evidence. Run
  `node scripts/check-pc-player-controls.cjs` with Chrome and Playwright available
  (`PLAYWRIGHT_MODULE` can point to the installed module). `SLAPS_CHECK_URL`
  selects a test target; screenshots and JSON go to `outputs/pc-player-controls`
  or `SLAPS_CHECK_OUTPUT`. This live check is not part of offline CI. A failure
  must remain an open defect, not be reported as a completed UI fix.
- Desktop and mobile: unchanged layout, DIG open/select/scroll/close, no page
  runtime errors. Do not claim native-device coverage from desktop emulation.
- Keep the browser process muted, intercept synthetic analytics and test
  broken-video reports, and close only the test sessions you created.

`outputs/shuffle-20260903/browser.cjs` was the v3.41 local evidence driver. It is
not version-controlled or a portable CI browser suite; verify its availability
and dependencies before reuse. Implementations must still meet the checklist
if that local file is unavailable. Do not report this manual gate as automated.

## Description changes

- Do not infer authorship from `user_name`: past generated text was attached to
  older community tracks. Establish provenance with the pre-change catalog.
- Remove only confirmed generated text. Preserve IDs, titles, poster, dates,
  ordering, metadata, and real comments, including short comments.
- `test-description-policy.js` checks the retired ID/text pairs, read-only API
  merging, later user edits, and that the retired filler cannot write files.
  `audit:songs` rejects known boilerplate; empty descriptions remain warnings
  and must not be filled merely to make warning counts smaller.
- Confirm the live API retains all songs and genuine comments. On the real UI,
  test both languages and reload: empty copy must stay empty without fallback.

## Production evidence

- Preserve unrelated changes. Confirm authorization before production mutation.
- Retain rollback deployment, synchronize release assets, and record the commit.
- After alias changes, verify public assets, actual UI, count, and error logs.
- Record pass/fail/unverified honestly. Separately list unrelated existing bugs.
- Update the TBR home and dated result. Do not call an untested fix complete.

## Daily live acceptance — required after each published 10-track release

Run the production UI check in an isolated Chrome process muted with
`--mute-audio`; this prevents audible playback without weakening the real player
state checks. Use real clicks only—never `force: true`, DOM state mutation, or
direct invocation of application handlers:

```sh
SLAPS_DAILY_DATE=YYYY-MM-DD \
SLAPS_CHECK_OUTPUT=outputs/daily-automation/YYYY-MM-DD \
npm run verify:daily:live
```

The gate must prove all of the following before the daily task is called complete:

- The muted opening video advances before START.
- START keeps the same YouTube ID and queue item, continues playback, and moves
  the YouTube player to the unmuted state while the browser process remains muted.
- LATEST is clicked and selects queue index 0 with the displayed/current video in
  sync and playing.
- DIG opens from its real control, returns at least one candidate, and a selected
  jacket populates the detail panel.
- TODAY'S 10 contains exactly 10 cards. PLAY ALL 10 is clicked and starts its
  first video with a 10-item daily queue.
- Page errors, actionable console warnings/errors, same-origin request failures,
  and Vercel production error/warning/HTTP 500 logs are zero.
- The baseline comparison still reports zero removed existing IDs and zero
  duplicate IDs.

Block analytics hosts and same-origin non-GET requests during the browser check so
the acceptance itself cannot create analytics noise or write production data.
Keep the generated JSON and screenshots as evidence; do not treat a build-only or
DOM-only assertion as proof of the live flow.

YouTube's iframe may conditionally render its own central play/pause overlay in
headless Chrome. Record that separately and confirm SLAPS `#playBtn` and
`#tapIndicator` are hidden. It is not evidence of a SLAPS control regression by
itself, but it must remain open if reproduced in a normal user browser.
