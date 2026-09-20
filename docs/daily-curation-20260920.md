# SLAPS daily curation — 2026-09-20

## Scope

Exactly 10 new SLAPS posts: US 6 / JP 4. Eras: 90s 2 / 00s 1 /
10s 3 / 20s 4. No existing song, description, community comment, retired
description, playback policy, subtitle or transcript option was changed.

## Verified sources

| YouTube ID | Track | Official source | Region | Era | Seconds | JP/EN description |
| --- | --- | --- | --- | --- | ---: | --- |
| NQFRmDgBwcg | De La Soul - Oodles of O's | DeLaSoulVEVO | US | 90s | 287 | present/present |
| -DF64y0LLbc | Masta Ace Incorporated - Sittin' On Chrome | Delicious Vinyl | US | 90s | 250 | present/present |
| t_Z8X_bgEpw | Mos Def - History feat. Talib Kweli | MosDefVEVO | US | 00s | 146 | blank/blank |
| anRkutaPS9w | Earl Sweatshirt - WHOA | OFWGKTA | US | 10s | 203 | present/present |
| EVlGLtCnN-Y | JID & Kenny Mason - Dance Now | JIDVEVO | US | 20s | 262 | blank/blank |
| _c1UQHvoN5Q | MAVI - 31 Days | MAVI | US | 20s | 174 | present/present |
| v7uc7PvcW2E | STUTS - Renaissance Beat / Pushin' | SPACE SHOWER | JP | 10s | 239 | present/present |
| IA5XLGkaCAo | BUPPON - i'll | J.Studio / Kojoe | JP | 10s | 224 | present/present |
| DEbao23Aa_E | BIM - Anchovy feat. どんぐりず | BIM | JP | 20s | 205 | present/present |
| yQiIjjV7gUU | KID FRESINO - runnin shot feat. Tiji Jojo | KID FRESINO | JP | 20s | 133 | present/present |

For each ID, watch/oEmbed/thumbnail returned HTTP 200, playabilityStatus OK,
playableInEmbed true, duration above 30 seconds, and storyboard data present.
Continuous storyboard frames were visually inspected: all adopted videos depict
moving performers, animation, performance action or changing scenes. Topic,
official-audio, visualizer, lyric and static-image uploads were not adopted.
Existing ID, normalized-title and same-song alternate-upload matches were rejected.

Machine metadata and visually inspected storyboards are retained in
`outputs/daily-automation/2026-09-20/` (not version-controlled). Region follows the
official artist/channel identity. Era follows the original song release where the
first-party page establishes it; otherwise it follows the official upload/release.

## Description provenance

Eight bilingual descriptions use only production credits in the official watch-page
description: director, cinematographer, editor, producer, beat and mix credits. Mos
Def and JID remain blank because the first-party descriptions do not provide useful
non-generic production credits. No generic video prose, title/region/era
restatement, subjective VIBE assertion or unverified interpretation was added.

## Acceptance boundary

Daily baseline: production 1,169; daily SLAPS 0; local 1,164; clean tracked tree.
Owner/writer: Codex. Checker: unchanged deterministic test suites, a separate
preexisting-record preservation audit, production API/assets, browser and logs.
Only daily data, this evidence document, version references and synchronized
Web/PWA/Android generated assets may enter the daily commit.
Production deployment/push are explicitly authorized by this daily job.
Real START, PLAY ALL, LATEST and DIG operations are authorized for daily acceptance.
They are executed in a dedicated Chrome process muted at the browser process boundary;
analytics and same-origin non-GET requests are intercepted so the check cannot pollute
metrics or mutate production data.
