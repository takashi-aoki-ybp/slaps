# SLAPS: protect the listening experience

Read `docs/shuffle.md` and `docs/release-checklist.md` before changing playback,
queue construction, filters, initial load, or player UI. Confirm the latest
SLAPS project home in TBR; do not substitute assumptions for user decisions.

## Do not silently change the product

- SHUFFLE treats all tracks in the selected pool equally. Do not add history,
  popularity, promotion, artist, region, or freshness weighting. Only the user's
  explicit region/era/favorites selection limits the pool. Preserve DAILY and
  shared-list ordering. See the exact immediate-repeat exception in the spec.
- Background video starts muted during the opening. START unlocks audio on the
  same video; it is not the gate for loading/starting that video.
- Preserve the layout, intro timing, mobile DIG position/scroll behavior,
  subtitles-off behavior, favorites, user-submitted text, and analytics unless
  the user has requested the corresponding change.
- A bug fix is not authorization to invent a new recommendation or selection
  policy. Identify any material product decision before implementation.

## Evidence before completion

- Never fill an empty description with the title, region/era, generic video
  prose, or subjective labels. Empty is preferable to invented information.
  Preserve genuine user comments. `data/retired-descriptions.json` records
  exact AI-generated text for safe removal even from legacy DB copies.

- Add a regression that fails for the reported defect. Preserve existing tests.
- Run `npm run verify`. Shuffle regressions and fault-injection checks are part
  of `npm test` and the existing GitHub CI workflow.
- When changing queue/player behavior, run the real click paths in the release
  checklist, not only helper-function tests. Use a process-muted test browser,
  prevent synthetic analytics/broken-video votes, and close owned browsers.
- Record exact tested commit, target, candidate count, visible count, and
  results. A successful build or deployment does not prove behavior.
- After an authorized production release, verify the actual `slaps.tokyo`
  assets and user flow. Keep local, Preview, deployed, and verified separate.
- Never claim that CI blocks all production deployments: direct CLI deployment
  remains possible. Require evidence before using it; do not bypass a failing
  test or weaken an assertion to ship.
