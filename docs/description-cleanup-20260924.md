# SLAPS credit-only description cleanup — 2026-09-24

## Decision

Production credits are source evidence, not SLAPS editorial copy. A description
that only translates or lists performers, producers, directors,
cinematographers, editors, animation staff, cast or other production roles must
remain blank. A description may be added only when verified information explains
something useful about the song, its writing, sound, structure, context or
meaning. Weak evidence means blank JP/EN fields.

## Scope

61 `posted by SLAPS` descriptions generated between 2026-09-16 and 2026-09-24
were retired in both languages:

- 2026-09-16: 5
- 2026-09-18: 9
- 2026-09-19: 7
- 2026-09-20: 8
- 2026-09-21: 6
- 2026-09-22: 8
- 2026-09-23: 9
- 2026-09-24: 9

This includes `ISSUGI - from Scratch` (`FP-HIFVLieA`) and
`Navy Blue - Orchards` (`UiZQ4rbhQzE`). Exact retired text is retained in
`data/retired-credit-descriptions.json` only to prevent stale Redis copies from
returning. It is not rendered as live copy.

## Protected data

Only `description.ja` and `description.en` change. YouTube IDs, titles, regions,
eras, thumbnails, vibe values, dates, ordering, user identity and every other
song field must remain byte-equivalent after description removal. Community
descriptions and older substantive SLAPS descriptions are outside this cleanup.

## Recurrence gate

- `audit:songs` rejects credit-only bilingual copy on SLAPS-managed records.
- `test-description-policy.js` verifies all 61 exact retirements, keeps later
  genuine edits, and distinguishes credit lists from substantive copy.
- The daily automation must not convert watch-page credits into a description.
  If no independently useful, verified song-specific explanation exists, both
  fields stay blank.

## Acceptance

- Local and production catalog counts and IDs remain unchanged.
- All 61 target descriptions are blank in the production API and rendered UI.
- `npm run verify` and `npm run android:verify` pass.
- Public asset parity, browser console/page errors and Vercel runtime logs are
  checked after deployment.
