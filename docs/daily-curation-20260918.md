# SLAPS daily curation — 2026-09-18

## Scope

Exactly 10 new SLAPS posts: US 6 / JP 4. Eras: 00s 1 / 10s 4 / 20s 5.
No existing song, description, community comment, retired description, playback policy,
subtitle or transcript option was changed.

## Verified sources

| YouTube ID | Track | Official source | Region | Era | Seconds | JP/EN description |
| --- | --- | --- | --- | --- | ---: | --- |
| MHvNapx5PFo | Danger Mouse & Black Thought - Aquamarine feat. Michael Kiwanuka | Danger Mouse and Black Thought | US | 20s | 238 | present/present |
| PsIiwHHiT3o | Mick Jenkins ft. BADBADNOTGOOD - Drowning | Mick Jenkins | US | 10s | 368 | present/present |
| W7fpqaX3K9M | Your Old Droog - Help feat. Wiki and Edan | Your Old Droog | US | 10s | 265 | present/present |
| LNR4WHaGQQw | Saba - Ziplock / Rich Don't Stop | Saba Pivot | US | 20s | 354 | present/present |
| PgpDN-bARwc | Jurassic 5 - Quality Control | Jurassic5VEVO | US | 00s | 280 | blank/blank |
| ySKCpxq1NEs | Skyzoo - Bed-Stuy is Burning | Mello Music Group | US | 20s | 306 | present/present |
| uLpaiRGld3Q | SEEDA - 親子星 | SEEDA | JP | 20s | 182 | present/present |
| GHuoD7t35ro | NORIKIYO - 夜に口笛 | ghettohollywood | JP | 10s | 235 | present/present |
| 2LRSamHMGBI | Daichi Yamamoto - 上海バンド | Jazzy Sport Official | JP | 10s | 230 | present/present |
| 42I92ipjBRc | C.O.S.A. - Mikiura feat. KID FRESINO | C.O.S.A. | JP | 20s | 211 | present/present |

For each ID, watch/oEmbed/thumbnail returned HTTP 200, playabilityStatus OK,
playableInEmbed true, duration above 30 seconds, and storyboard data present.
Continuous storyboard frames were visually inspected: all adopted videos depict
moving performers or changing scenes. C.O.S.A. - The Man (`FeATeVAwQRc`) was
rejected because its storyboard is dominated by a repeating graphic. Existing ID,
normalized-title, and same-song alternate-upload matches were rejected.

Watch evidence: `https://www.youtube.com/watch?v=YOUTUBE_ID` using the IDs above.
Machine metadata and visually inspected storyboards are retained in
`outputs/daily-automation/2026-09-18/` (not version-controlled).

Region follows the official artist/channel identity. Era follows the original song
release when first-party evidence is available; otherwise it follows the official
upload date. Jurassic 5's official description identifies the recording as a 2000
Interscope release, so it is classified in the 00s despite the 2009 VEVO upload.

## Description provenance

Nine bilingual descriptions contain only first-party watch-page credits: directors,
cinematographers, producers, featured performers and the confirmed Mikiura location.
Jurassic 5 remains blank because its first-party description does not identify useful
track-specific production credits. No generic video prose, title/region/era restatement,
subjective VIBE assertion or unverified interpretation was added.

## Acceptance boundary

Daily baseline: production 1,149; daily SLAPS 0; local 1,144; clean tracked tree.
Owner/writer: Codex. Checker: unchanged deterministic test suites, a separate
preexisting-record preservation audit, production API/assets, browser and logs.
Only daily data, this evidence document, version references and synchronized
Web/PWA/Android generated assets may enter the daily commit.
Production deployment/push are explicitly authorized by this daily job.
Real START, PLAY ALL, LATEST and DIG operations are authorized for daily acceptance.
They are executed in a dedicated Chrome process muted at the browser process boundary;
analytics and same-origin non-GET requests are intercepted so the check cannot pollute
metrics or mutate production data.
