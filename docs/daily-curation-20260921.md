# SLAPS daily curation — 2026-09-21

## Scope

Exactly 10 new SLAPS posts: US 6 / JP 4. Eras: 90s 1 / 00s 2 /
10s 2 / 20s 5. No existing song, description, community comment, retired
description, playback policy, subtitle or transcript option was changed.

## Verified sources

| YouTube ID | Track | Official source | Region | Era | Seconds | JP/EN description |
| --- | --- | --- | --- | --- | ---: | --- |
| O5TUqdxqHS0 | The Roots - Proceed | TheRootsVEVO | US | 90s | 260 | blank/blank |
| Z3YV1hzALHs | Lupe Fiasco - Hip-Hop Saved My Life feat. Nikki Jean | Atlantic Records | US | 00s | 246 | blank/blank |
| 0OPS3kw1U5c | Talib Kweli - Hostile Gospel Pt. 1 | Warner Records | US | 00s | 249 | blank/blank |
| eD_QnHxM1_A | Oddisee - You Grew Up | Mello Music Group | US | 10s | 241 | present/present |
| ggq-yWQUTdg | Blu & Exile - In My Window feat. TOBi | dirty science | US | 20s | 244 | blank/blank |
| BA4VcGXlu_o | Mick Jenkins - Publix | Mick Jenkins | US | 20s | 160 | present/present |
| WqP2vnILsZk | PUNPEE - 夢追人 feat. KREVA | PUNPEE | JP | 20s | 268 | present/present |
| 4h_OZ1F1BjQ | RHYMESTER - Kids In The Park feat. PUNPEE | Victor Entertainment | JP | 10s | 225 | present/present |
| 78TkW0R14qM | OMSB - Bro feat. JJJ | OMSB | JP | 20s | 220 | present/present |
| 6a5uYAWn3eU | Daichi Yamamoto - Orange Juice | Daichi Yamamoto OFFICIAL | JP | 20s | 212 | present/present |

For each ID, watch/oEmbed/thumbnail returned HTTP 200, playabilityStatus OK,
playableInEmbed true, duration above 30 seconds, and storyboard data present.
Continuous storyboard frames were visually inspected: all adopted videos depict
moving performers, animation, performance action or changing scenes. Topic,
official-audio, visualizer, lyric and static-image uploads were not adopted.
Existing ID, normalized-title and same-song alternate-upload matches were rejected.
Blackalicious - Deception was rejected because an alternate upload of the same
song already exists in the catalog.

Machine metadata and visually inspected storyboards are retained in
`outputs/daily-automation/2026-09-21/` (not version-controlled). Region follows the
official artist/channel identity. Era follows the original song release where the
first-party page establishes it; otherwise it follows the official upload/release.

## Description provenance

Six bilingual descriptions use only production credits in the official watch-page
description: director, animator, cinematographer, editor, producer or executive
producer credits. The Roots, Lupe Fiasco, Talib Kweli and Blu & Exile remain blank
because their first-party descriptions do not provide useful non-generic production
credits. No generic video prose, title/region/era restatement, subjective VIBE
assertion or unverified interpretation was added.

## Acceptance boundary

Daily baseline: production 1,179; daily SLAPS 0; local 1,174; clean tracked tree.
Owner/writer: Codex. Checker: unchanged deterministic test suites, a separate
preexisting-record preservation audit, production API/assets, browser and logs.
Only daily data, this evidence document, version references and synchronized
Web/PWA/Android generated assets may enter the daily commit.
Production deployment/push are explicitly authorized by this daily job.
Real START, PLAY ALL, LATEST and DIG operations are authorized for daily acceptance.
They are executed in a dedicated Chrome process muted at the browser process boundary;
analytics and same-origin non-GET requests are intercepted so the check cannot pollute
metrics or mutate production data.
