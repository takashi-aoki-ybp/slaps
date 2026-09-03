# Product analytics, measurement version 2

GTM: `GTM-WCJPZNQP`. GA4: `G-6QREG2C14S` (property 540416783).
`config/gtm-product-events.json` is a **merge-only** partial container import.
Never overwrite the whole container with this file. Existing Google/Wicle/legacy
click tags are deliberately outside this import.

## Interpretation

- Filter new analysis to `measurement_version = 2`; historical measurements are
  retained, not rewritten. Old open tabs may continue emitting unversioned data.
- `slaps_start` means START was pressed, not that audio was heard.
- `slaps_track_3_reached` means three distinct video IDs have actually advanced
  while the player reported PLAYING after START. It does not mean three completed
  tracks, nor a minimum listening duration per track.
- `slaps_listen_5_minutes` requires 300 seconds of verified progressing playback
  after START. Samples are taken once a second. Pauses, errors, buffering, seeks,
  frozen players and sampling gaps over 2.5 seconds are excluded. This is a
  conservative measure: background browser throttling may undercount, but must
  not turn sleep or stalls into listening. Muted/volume-zero playback can count;
  the browser cannot prove the listener heard the audio.
- START, three-track and five-minute events fire once per page lifetime, not per
  GA4 session or across reloads.
- `slaps_return_d1/d7` mean activity on exactly calendar day 1 or 7 after the first
  locally recorded visit, in Asia/Tokyo. Day 30 does not backfill either event.
  The first-visit key is retained; the sent-milestone key is versioned. These are
  per-browser storage milestones, not authenticated-user retention. Storage loss,
  incognito and multiple devices affect the denominator. `cohort_date` on return
  events identifies the locally recorded first day.
- Share events fire after the operation settles, with `share_outcome`: `shared`
  (Web Share API resolved), `copied` (clipboard confirmed), `cancelled` (user
  cancelled), or `failed`. Never equate these with an external post delivered to
  a recipient. For successful handoff counts use shared/copied only.

## GTM event identity and analysis

The current-event variable matches both `{{Event}}` and the data-layer
`gtm.uniqueEventId`. It never selects the latest same-name message blindly. Missing
identity fails closed to an empty parameter object, without reading another event.
Only allowlisted primitive properties are forwarded; debug_mode is Preview-only.

GA4 event-scoped custom dimensions: measurement_version, mode, action,
share_outcome, date, cohort_date. Registration is not historical backfill.
YouTube IDs are not registered as a high-cardinality dimension by default.
Do not add legacy click_* counts to slaps_* counts for the same action.
Only the product-event trigger is production-host-limited; legacy tags' local
traffic exclusion remains a separate task. QA/Preview traffic is not organic growth.

## Acceptance and rollback

- `npm run verify` includes `scripts/test-analytics.js`: delayed same-name events,
  missing/mismatched ID, property allowlist, exact JST retention, playback stalls,
  seek/suspension, actual progress, share cancellation/failure/success.
- Browser checks must use process-level mute-audio and close owned sessions.
  Synthetic time/retention tests must not send data into production analytics.
- Keep GTM v4 and Web v3.39 as rollback points. A rollback restores their known
  measurement limitations. It does not erase previously collected data.
- No changes to song data, CSS, intro timing, background autoplay or START's
  unmute behavior are required by these measurement fixes.
