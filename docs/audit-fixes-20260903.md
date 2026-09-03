# SLAPS 全面監査後の修正 — v3.43候補

handoff_version: 1.0
project: SLAPS
projectPath: SLAPS
owner_ai: Codex
reviewer_ai: deterministic regression checks and real browser
status: waiting
updated_at: 2026-09-03

## 完了条件と保護対象

監査で再現した不具合を既存のデザイン・オープニング・曲・ユーザー投稿・お気に入り・計測を保ったまま修正する。
コード修正とローカル検証は実施済み。本番反映・GitHub mainへの反映は未実施。
本番v3.42の基準commitは83ba27a480d472fbe92315192f7e81381497d99d。

## 実施済み

- A1: お気に入りの再生情報を現行カタログと照合。古いWhite Wallsの生成説明が再表示されない。保存ID／順序は維持し、読取時にlocalStorageを書き換えない。
- A2: DIGのキーイベントを分離し、documentのキー／スワイプ処理にもDIGモーダル境界を追加。
- A3: DIG取得に世代と現在曲IDの照合を追加。逆引きフォールバックにも同じ要求を引き継ぎ、旧応答・旧エラーが現行候補を上書きしない。
- A4: YouTubeタイムアウトでready/startedを偽装しない。null player呼出を防止。STARTでAPI読み込みを再試行し、まずミュートで復帰する。正常時のSTARTは同一動画の音声許可という仕様を維持。
- A5: 言語・presence・旧字幕設定のstorage例外を安全化。favoritesは型検証とセッション内の代替保存、音量はNaN防止。旧ローカル投稿・破損情報リストの型検証も追加。
- A6/A7: 管理の説明更新をLuaによる旧値照合＋LSETへ変更。曲の削除／再挿入を行わず位置を保つ。競合は409。12箇所のRedisヘルパーでHTTP200内のerrorも失敗と扱う。
- 管理説明更新は日英とも空欄を許容。片言語だけの指定では反対の言語を保持する。
- A8: 壊れたRedis JSON行だけを除外し、正常なDB固有曲は返す。検知ログは内容を出さない。
- A9: シェア用middlewareで動画IDを検証し、HTML属性・テキストに入れる値をエスケープ。
- B1/B2/B3: DAILY深いリンクは初回だけ開く。LATESTは追加日時を優先し、保存曲再生時の件数をキューと合わせる。LATEST連打の旧応答とボタン表示の競合も修正。
- B4の一部: アーティスト判定を文字列部分一致から単語境界へ変更。ユーザー指定のOTHER／年代を自動推測で上書きしない。
- B7: 保存リストと再生・保存イベント計測を区別する文言へ修正。計測処理は変更していない。
- B8/B9: 本文なしPOSTは400。空の曲一覧では通信案内を表示し、STARTで再取得できる。
- B10の一部: 互換範囲でtar7.5.22、brace-expansion5.0.9、xmldom0.9.12へ更新。npm auditはcritical1/high1/moderate6からcritical0/high0/moderate5へ。
- Web/PWAとAndroid資産をv3.43/343へ同期。

## 検証証拠

- npm run verify: 成功。既存テストを削除・緩和していない。
- scripts/test-audit-regressions.js: 18項目成功。SLAPS_TEST_BASELINE=83ba27aで修正前に同じ18項目がすべて失敗することも確認。
- API故障注入は実handler＋隔離モックRedis。部分失敗／HTTP200のerror／競合／正常更新／空欄更新、行破損、本文なし入力、HTML反射、非同期競合などを検証。
- Luaの実Redisエンジン／Upstash上での実行は未検証。モックの成功だけで本番DB更新完了とはしていない。実DBの書き換えは0。
- outputs/audit-fix-20260903/browser.cjs: ローカル配信コード＋本番由来1,011曲のスナップショット、実YouTubeで10シナリオ成功。START前の映像時間進行、同一動画・iframe、旧保存説明、DIGキー・スワイプ・下部固定、storage拒否、YouTube障害復帰、空一覧復帰、旧候補応答を確認。
- outputs/audit-fix-20260903/shuffle.cjs: ローカルコード＋公開GET、全1,011曲、8回のSHUFFLE、fr/90s4曲一周、PREV/NEXT、DAILY→全曲、LATEST、PC/SP、pageerror0。
- ブラウザーはプロセスで消音。SLAPSへのテスト投稿／presence／broken voteと解析送信を遮断。YouTubeの通常プレーヤー通信は維持。終了済み。
- 検証器の初期不備も修正：DIGアニメーション完了前の座標採取、Touchの必須値不足、Storage拒否がYouTube子フレームに波及する設定、補助SHUFFLE検証でYouTubeのPOSTまで遮断する設定。アプリの挙動を隠す例外処理やassert削除ではなく、対象・観測タイミングを修正した。
- npm run android:verify: 同期＋Gradle testDebugUnitTest成功。実機のオンラインAPI接続・ストア配信の証拠ではない。
- data/songs.json、data/retired-descriptions.json、styles.css、src/analytics.jsに差分なし。
- /tmp/slaps-audit-fix-verify.log、/tmp/slaps-audit-fix-android-verify.log、/tmp/slaps-audit-fix-shuffle.log、/tmp/slaps-audit-fix-baseline.log。
- ブラウザー結果／スクリーンショット／npm audit JSONはoutputs/audit-fix-20260903/。

## 未完了・別途必要

1. 本番デプロイとslaps.tokyoでの公開後検証。現時点の本番はv3.42のまま。
2. GitHub定期監査を動かす既定mainへの必要設定反映。main全体の無確認マージはしない。
3. 実Redis/UpstashでのLuaコマンド実行確認。承認された隔離環境で検証し、本番曲をテスト用に更新しない。
4. Android実機のAPI接続。相対URLがlocalhostへ向く構成は今回未修正。資産同期と混同しない。
5. Jimp系の残るmoderate5パッケージ。メジャー更新を伴うため画像生成の互換性検証を分けて実施する。
6. 国・年代未指定時の推測／アップロード年と作品年の相違。既存全曲の年代・説明の一次資料照合、重複候補3組の版違い確認も残る。
7. Redis現容量・全TTL、GA4/Wicle全イベント実受信、実iPhone Safariの全端末確認は今回の修正完了範囲に含めない。

## 次アクション

owner: Codex
action: 公開承認後、隔離環境でDBコマンド互換性を確認し、Webの本番反映・公開後の実操作確認。定期監査のmain反映は差分を限定して別途確認。
blocker: 本番・mainへの公開操作は未承認。実Redisの新しい更新コマンドは実環境の確認待ち。

## 参照

- TBR: SLAPS_案件ホーム / 2026-09-03_SLAPS_全面再監査
- [node-tar advisory](https://github.com/advisories/GHSA-r292-9mhp-454m)
- [brace-expansion advisory](https://github.com/advisories/GHSA-rgw5-rvv9-x895)
- [xmldom advisory](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6)

