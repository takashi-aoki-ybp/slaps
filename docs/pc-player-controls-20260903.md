# SLAPS PC中央アイコン表示調査（条件依存・既知制約）

- Date: 2026-09-03
- Status: accepted limitation — 既存の再生体験を保つ有効な修正は未確認。本番変更なし。ユーザーが通常環境で非表示を確認したため、YouTubeへの外部報告は行わず、条件依存の既知制約として検査を残す。
- Tested source: e5e994cc087481a832f48ced7cbede58c3306433（アプリ本体 f242996127fbdc6d8ff2513dfbd5c2618d77c39b）
- Target: https://slaps.tokyo/?v=I55oZGIewkg / styles.css v3.43

## 確定事実
- PCでUI初期表示、中央のSLAPSボタンを隠す処理は6月5日のコミット a8524a0 / 8f6fa720 に存在し、現行にも残っている。
- ユーザーが開いているChromeタブを読み取り確認。SLAPSの #playBtn はdisplay:none、#tapIndicatorもhidden。見えている中央アイコンはYouTubeフレームの .player-control-play-pause-icon。
- 新規のプロセスミュート検証ブラウザでも再現。controls=0が実際のiframe URLにあるのに、停止・再開後にYouTube側アイコンが残る。
- 公開版への3回停止/再開テスト6状態中5状態で中央YouTubeコントロールが可視。SLAPS側2要素は全6状態で非表示。
- ユーザーの古い読み込み済みCSS（v3.41）だけの問題ではない。新規v3.43でも再現したため、キャッシュ削除で直るとは案内しない。
- YouTube側の変更時期・内部原因は未特定。「SLAPSの非表示指定を削除した」とも「特定日からYouTubeが仕様変更した」とも断定しない。
- 前回の確認は自前ボタンの状態に偏り、YouTubeフレーム内の中央表示を見落としていた。

## 検証したが採用しなかった変更
テストブラウザ内でだけソース応答を差し替え、アプリソース/本番は未変更。
- constructorへのvideoId指定: 2回目の停止・再開で再発。
- PC検証のplaysinline:0: 2回目の停止・再開で再発。
- 公式youtube-nocookie.comホスト: 初回だけ消えることがあるが2/3回目で再発。
- 一度消えたことだけをもって有効とはしない。再生方式、中央マスク、映像の切り取り、音声/START仕様変更は行っていない。

## 追加した検査
- scripts/check-pc-player-controls.cjs: 実YouTubeで中央コントロールを検出するライブ検査。analyticsと同一originの非GETは送信せず、ブラウザプロセスをミュート。3回停止・再開し、SLAPSとYouTube両方の可視性・スクリーンショットを保存。
- docs/release-checklist.mdにPC中央コントロール検証を必須化。オフラインCIへ組み込んだとは主張しない。
- npm run verify: exit 0。1007 seed曲監査 Errors 0 / 既存空説明Warnings308、18 audit regressions passed。
- ライブ検査: exit 1（期待する不具合検出）。outputs/pc-player-controls/evidence.json と cycle-*-*.png。これは修正完了の証拠ではない。
- 開始時ミュートとSTARTで同一動画維持も検査済み。

## 次の境界
engineering-loopの停止条件に従い、同じ表示不良を繰り返す設定変更を本番に採用しない。YouTube側の正式な修正/対応が必要か、再生構成を変える必要があるかは未決。既存体験を変える回避策はユーザー判断なしで実装しない。ユーザーの通常タブは操作・再読込・音声変更していない。


## 再開調査（2026-09-03、対応依頼の訂正後）

- ユーザーの「対応済み」は完了報告ではなく「対応済み？」という質問だった。ユーザー自身が直したとは扱わない。
- アプリ本体は変更せず、消音テストブラウザで追加比較：パラメータ削減、iframeのblur/tabIndex=-1、公開API setSizeで現寸法再設定、iframe inert、マウスを表示領域外へ移動。全て反復停止/再開後の中央アイコンは残った。
- **SLAPSコード/CSSを全く含まない最小HTMLでも再現**。640×360の通常YouTube iframe、videoId I55oZGIewkg、autoplay=1/mute=1/controls=0/playsinline=1、外側のunMute/pauseVideo/playVideoボタンだけ。6状態中4状態でYouTube中央コントロールが可視。ブラウザ描画画像でも確認した。SLAPS固有のCSSやイベントが必須の発生要因ではない。
- ローカル証拠: outputs/pause-20260903/minimal.html、isolate.cjs、isolated-0..5.png。追加比較ログ /tmp/slaps-resume.log、/tmp/slaps-resume-inert.log、/tmp/slaps-isolate.log。
- controls=0は現在の公式文書でも非表示指定とされる（https://developers.google.com/youtube/player_parameters#controls）。この観測からYouTube側の不具合/挙動差は考えられるが、内部原因・発生開始日は未確定。
- engineering-loopの反復失敗時の停止条件に到達。有効性を確認できない設定の本番反映や、映像/操作を変える回避策は行っていない。状態は未解決。次の有意な手段は最小再現例を添えたYouTube側への不具合報告等。外部送信はまだ行っていない。

## その後の判断と再確認（2026-09-07）

- ユーザーは通常の本番画面で中央アイコンが表示されなくなったことを確認し、YouTubeへの不具合報告は不要と判断した。この判断を優先し、外部報告は行わない。
- 一方、3.59本番をHeadless Chromeで再検査すると、6状態中5状態でYouTubeフレーム内の中央アイコンを検出し、画面キャプチャ上でも表示を確認した。SLAPSの `#playBtn` と `#tapIndicator` は非表示だった。
- したがって「全面的に修正済み」とは扱わない。通常利用では受容済み、特定のブラウザ状態では再現するYouTube側の条件依存挙動として残す。
- `scripts/check-pc-player-controls.cjs` は本番コードや自動CIへ接続せず、将来の再発調査で明示的に実行する診断用検査として保持する。
