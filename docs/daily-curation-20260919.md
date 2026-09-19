# SLAPS daily curation — 2026-09-19

## Scope

Exactly 10 new SLAPS posts: US 6 / JP 4. Eras: 90s 2 / 00s 1 / 10s 5 / 20s 2.
No existing song, description, community comment, retired description, playback policy,
subtitle or transcript option was changed.

## Verified sources

| YouTube ID | Track | Official source | Region | Era | Seconds | JP/EN description |
| --- | --- | --- | --- | --- | ---: | --- |
| NF3wEImfjJk | Little Brother - Everything | Little Brother | US | 10s | 238 | present/present |
| AeQMS6UnFUU | Masta Ace & Marco Polo - Get Shot | Fat Beats | US | 10s | 194 | present/present |
| lhvd4jPboyQ | Mos Def - Ghetto Rock | MosDefVEVO | US | 00s | 223 | blank/blank |
| HmOd0GKuztE | Common - Resurrection | CommonVEVO | US | 90s | 246 | blank/blank |
| b5-XhnhG0MA | De La Soul - Itzsoweezee (HOT) | DeLaSoulVEVO | US | 90s | 221 | blank/blank |
| QFwTLvj0418 | Noname - Hundred Acres feat. Devin Morrison | Noname | US | 20s | 191 | present/present |
| rhrVrLuWW-Y | BUPPON - 蓄積タイムラグ | THE AXIS RECORDS | JP | 10s | 324 | present/present |
| BI8xo6psdKg | Campanella - Indigo | blackfilesstv / SPACE SHOWER | JP | 10s | 250 | present/present |
| 4QPZW0dJi6Q | ISSUGI & GRADIS NICE - DAY and NITE / Blaze Up | DAWNDEYS | JP | 10s | 119 | present/present |
| nMWkOEF9RdI | KID FRESINO - No Sun | SPACE SHOWER | JP | 20s | 252 | present/present |

For each ID, watch/oEmbed/thumbnail returned HTTP 200, playabilityStatus OK,
playableInEmbed true, duration above 30 seconds, and storyboard data present.
Continuous storyboard frames were visually inspected: all adopted videos depict
moving performers, animation, choreography or changing scenes. Topic, official-audio,
visualizer, lyric and static-image uploads were not adopted. Existing ID,
normalized-title and same-song alternate-upload matches were rejected.

Machine metadata and visually inspected storyboards are retained in
`outputs/daily-automation/2026-09-19/` (not version-controlled). Region follows the
official artist/channel identity. Era follows the original song release where the
first-party page establishes it; otherwise it follows the official upload/release.

## Description provenance

Seven bilingual descriptions use only credits in the official watch-page description:
director, cinematographer, editor, choreographer, producer, beat and scratch credits.
Mos Def, Common and De La Soul remain blank because their first-party descriptions do
not provide useful non-generic production credits. No generic video prose, title/region/
era restatement, subjective VIBE assertion or unverified interpretation was added.

## Acceptance boundary

Daily baseline: production 1,159; daily SLAPS 0; local 1,154; clean tracked tree.
Owner/writer: Codex. Checker: unchanged deterministic test suites, a separate
preexisting-record preservation audit, production API/assets, browser and logs.
Only daily data, this evidence document, version references and synchronized
Web/PWA/Android generated assets may enter the daily commit.
Production deployment/push are explicitly authorized by this daily job.
Real START, PLAY ALL, LATEST and DIG operations are authorized for daily acceptance.
They are executed in a dedicated Chrome process muted at the browser process boundary;
analytics and same-origin non-GET requests are intercepted so the check cannot pollute
metrics or mutate production data.

## Live production acceptance

Passed at 2026-09-19 09:12 JST against Production
`dpl_C8Jhd8uQtmvwGs4YDXzfd9kcBXQy`, aliased to `slaps.tokyo` and
`www.slaps.tokyo`. Evidence is retained in
`outputs/daily-automation/2026-09-19/` (not version-controlled).

- Final machine gate: exit 0 / status `pass`; production 1,169 / local 1,164 /
  daily 10 / baseline delta 10 / community additions 0 / removals 0. Daily OG
  is JPEG 1200x630 with repeated `KV_HIT`.
- Opening: `oZPiskvDlTo` advanced from 1.82s to 3.63s while muted before START.
- START: the same `oZPiskvDlTo` queue item continued playing; the YouTube API
  changed to unmuted while the Chrome process remained muted.
- LATEST: a real click selected index 0, `nMWkOEF9RdI`; displayed, queued and
  playing IDs matched.
- DIG: opened by its real control, returned 16 jackets, and a real jacket click
  populated the detail panel.
- TODAY'S 10 / PLAY ALL: `10 NEW TODAY` and all ten ordered cards rendered; a
  real PLAY ALL click created a ten-item daily queue and played `NF3wEImfjJk`
  at index 0 with advancing time.
- Browser: page errors 0, actionable console errors/warnings 0, same-origin
  request failures 0. YouTube/DoubleClick CORS noise was isolated as third-party
  and non-actionable.
- SLAPS controls: `#playBtn` and `#tapIndicator` were both not visible during
  daily playback. The central pause icon visible in the headless screenshot is
  owned by the YouTube iframe and is recorded separately from SLAPS controls.
- Production assets: public `index.html`, `service-worker.js`, and
  `data/songs.json` byte-match local. Vercel deployment-filtered errors,
  warnings and HTTP 500 entries are all 0.
