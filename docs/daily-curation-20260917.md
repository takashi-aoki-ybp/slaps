# SLAPS daily curation — 2026-09-17

## Scope

Exactly 10 new SLAPS posts: US 6 / JP 4. Eras: 00s 2 / 10s 4 / 20s 4.
No existing song, description, community comment, retired description, playback policy,
subtitle or transcript option was changed.

## Verified sources

| YouTube ID | Track | Official source | Region | Era | Seconds | JP/EN description |
| --- | --- | --- | --- | --- | ---: | --- |
| 5ExQQxaiwbU | KOTA The Friend - Chicago Diner | KOTA The Friend | US | 10s | 181 | blank/blank |
| 0MT1AegYI_4 | Lute - Eye to Eye ft. Cozz | LuteVEVO | US | 20s | 219 | blank/blank |
| Aqo-hyxjCYE | Marlon Craft - Gang Shit | Marlon Craft | US | 10s | 344 | blank/blank |
| AXbPrc6l-_s | Domo Genesis & Graymatter - World Gone Mad | Domo Genesis | US | 20s | 138 | blank/blank |
| TTjtJWaNfZg | Jae Skeese - Brick After Brick (Ground Level) | JaeSkeeseVEVO | US | 20s | 345 | blank/blank |
| B5laMdec9KU | redveil & JPEGMAFIA - black enuff | redveil | US | 20s | 159 | blank/blank |
| ad2i1B6YPF8 | PUNPEE - Happy Meal | PUNPEE | JP | 10s | 326 | blank/blank |
| Viqy0xzu_AU | BASI - It's all good | BASICMUSICTV | JP | 10s | 307 | blank/blank |
| yrVDuiEJEdY | OZROSAURUS - The Phoenix (will rise) | ponycanyon | JP | 00s | 332 | blank/blank |
| jPDbyLGjYFk | 田我流 - 墓場のDigger feat. BigBen | Studio Ishi MMM | JP | 00s | 365 | blank/blank |

For each ID, watch/oEmbed/thumbnail returned HTTP 200, playabilityStatus OK,
playableInEmbed true, duration above 30 seconds, and storyboard data present.
Continuous storyboard frames were visually inspected: all adopted videos depict
moving performers or changing scenes. Existing ID, normalized-title, and same-song
alternate-upload matches were rejected.

Watch evidence: `https://www.youtube.com/watch?v=YOUTUBE_ID` using the IDs above.
Machine metadata and visually inspected storyboards are retained in
`outputs/daily-automation/2026-09-17/` (not version-controlled).

Region follows the official artist/channel identity. Era follows the original song
release when first-party evidence is available; otherwise it follows the official
upload date. The OZROSAURUS watch-page description identifies its source as the 2006
album `Rhyme & Blues`, so it is classified in the 00s despite the 2022 video upload.

## Description provenance

All descriptions are blank. No generic video prose, title/region/era restatement,
subjective VIBE assertion, or unverified interpretation was added.

## Acceptance boundary

Daily baseline: production 1,139; daily SLAPS 0; local 1,134; clean tracked tree.
Owner/writer: Codex. Checker: unchanged deterministic test suites, a separate
preexisting-record preservation audit, production API/assets, browser and logs.
Only daily data, this evidence document, version references and synchronized
Web/PWA/Android generated assets may enter the daily commit.
Production deployment/push are explicitly authorized by this daily job.
The owner subsequently authorized real START, PLAY ALL, LATEST and DIG operations
for this release and future daily acceptance. They are executed in a dedicated
Chrome process muted at the OS/browser process boundary; analytics and same-origin
non-GET requests are intercepted so the check cannot pollute metrics or mutate
production data.

## Live production acceptance

Passed at 2026-09-17 10:29 JST against the published production release.
Evidence is retained in
`outputs/daily-automation/2026-09-17/live-interactions.json` and corresponding
screenshots (not version-controlled).

- Opening: `xrizNyOr548` advanced while muted before START.
- START: the same `xrizNyOr548` queue item continued playing; the YouTube API
  changed to unmuted while the test browser process remained muted.
- LATEST: a real click selected queue index 0, `jPDbyLGjYFk`, and the displayed,
  queued and playing video IDs matched.
- DIG: opened by its real control, returned two jackets, and a jacket selection
  populated the detail panel.
- TODAY'S 10 / PLAY ALL: all 10 cards rendered; a real PLAY ALL click created a
  10-item daily queue and started `5ExQQxaiwbU` at index 0.
- Browser: page errors 0, actionable console errors/warnings 0, same-origin
  request failures 0.
- Production data: 1,149 unique IDs, duplicate IDs 0, existing IDs removed 0,
  daily IDs missing 0.
- Vercel runtime logs for the production deployment: errors 0, warnings 0,
  HTTP 500 entries 0 in the checked post-release window.

The headless Chrome capture can show YouTube's iframe-owned central pause overlay.
The SLAPS-owned `#playBtn` and `#tapIndicator` are hidden, and the condition is the
previously documented YouTube iframe limitation rather than a new SLAPS control.
Do not report it as fixed; re-open it only if it appears in a normal user browser.
