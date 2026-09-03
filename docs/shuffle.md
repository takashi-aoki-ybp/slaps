# SHUFFLE — v3.41

- Shuffle all eligible tracks together using Fisher–Yates. No preference based on prior visits, loads, popularity, artist, or promotion.
- Do not read or write the old `slaps_played` / `slaps_recent` storage keys. Existing values are left untouched and ignored; favorites and analytics are separate and unchanged.
- Generate a new order on an explicit SHUFFLE click and at the end of each forward cycle. With at least two tracks, avoid immediately repeating the current track at those boundaries.
- Within a cycle each candidate appears once. This still uses a transient randomized playback queue to support NEXT/PREV; it is not an editorial shortlist or an independent-with-replacement draw on every NEXT. Chance repeats across cycles are possible.
- Retain the latest pair of cycle queues in memory for reversible PREV/NEXT at that boundary. Initial backward wrap is also reversible without triggering a new shuffle.
- Respect region/era, broken-video exclusion, and the selected favorites pool. LATEST sorting, DAILY sequence and shared-list sequence remain unchanged.
- No CSS, song data, intro timing, muted background autoplay, START audio-unlock, or analytics changes.

## Acceptance

`npm run verify` includes `scripts/test-shuffle.js`: all six permutations of a three-track pool, independence from legacy history, immediate-repeat avoidance, fresh draws each cycle, reversible navigation, single/empty pool, filters, favorites, LATEST, DAILY and shared lists.

Real-browser evidence: `outputs/shuffle-20260903/browser.cjs`. Starts with legacy history containing all but five catalog IDs, clicks SHUFFLE eight times, checks complete candidate coverage, drives a small region/era pool through a cycle with real NEXT/PREV clicks, then checks LATEST, DAILY, START, and mobile DIG. Chrome is process-muted; synthetic analytics and broken-video votes are intercepted. `--production` disables the local frontend overlay.
