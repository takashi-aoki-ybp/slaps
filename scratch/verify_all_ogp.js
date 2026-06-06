import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localSongsPath = path.join(__dirname, '..', 'data', 'songs.json');
if (!fs.existsSync(localSongsPath)) {
  console.error('songs.json not found');
  process.exit(1);
}

const songs = JSON.parse(fs.readFileSync(localSongsPath, 'utf8'));
const targetHost = 'https://slaps.tokyo';

async function verifyOgp(song) {
  const result = {
    name: song.name,
    youtube_id: song.youtube_id,
    imageOk: false,
    imageStatus: 0,
    imageContentType: '',
    imageSize: 0,
    cacheHeader: '',
    htmlOk: false,
    htmlStatus: 0,
    ogTitleOk: false,
    ogDescOk: false,
    ogImageOk: false,
    error: null
  };

  try {
    // 1. OGP画像APIの検証
    const imageUrl = `${targetHost}/api/og-image?v=${song.youtube_id}&ext=.jpg`;
    const imgRes = await fetch(imageUrl, { method: 'GET' });
    result.imageStatus = imgRes.status;
    result.imageContentType = imgRes.headers.get('content-type') || '';
    result.cacheHeader = imgRes.headers.get('x-slaps-cache') || 'NONE';
    
    if (imgRes.status === 200) {
      const arrayBuffer = await imgRes.arrayBuffer();
      result.imageSize = arrayBuffer.byteLength;
      if (result.imageContentType.includes('image/jpeg') && result.imageSize > 0) {
        result.imageOk = true;
      }
    }

    // 2. クローラー向け HTML OGP設定の検証
    const pageUrl = `${targetHost}/?v=${song.youtube_id}`;
    const htmlRes = await fetch(pageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Twitterbot/1.0'
      }
    });
    result.htmlStatus = htmlRes.status;

    if (htmlRes.status === 200) {
      const htmlText = await htmlRes.text();
      
      // og:title の検証 (期待値: Play on SLAPS)
      result.ogTitleOk = htmlText.includes('<meta property="og:title" content="Play on SLAPS">');
      
      // og:description の検証 (期待値: Play on SLAPS | 曲名)
      // 特殊文字やエスケープがあるため、部分一致でチェック
      const expectedDesc = `Play on SLAPS | ${song.name}`;
      result.ogDescOk = htmlText.includes(expectedDesc);
      
      // og:image の検証 (期待値: https://slaps.tokyo/api/og-image?v=動画ID&ext=.jpg)
      const expectedOgImage = `content="https://slaps.tokyo/api/og-image?v=${song.youtube_id}&ext=.jpg"`;
      result.ogImageOk = htmlText.includes(expectedOgImage);

      if (result.ogTitleOk && result.ogDescOk && result.ogImageOk) {
        result.htmlOk = true;
      } else {
        // デバッグ用のログ（不整合時）
        if (!result.ogDescOk) {
          console.warn(`  [Debug] og:desc mismatch for "${song.name}". Expected: "${expectedDesc}"`);
        }
      }
    }
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

async function main() {
  console.log(`=== SLAPS All-Song OGP Verification Started ===`);
  console.log(`Total songs to verify: ${songs.length}`);

  const results = [];
  const CHUNK_SIZE = 4; // 同時実行数 4

  for (let i = 0; i < songs.length; i += CHUNK_SIZE) {
    const chunk = songs.slice(i, i + CHUNK_SIZE);
    console.log(`Verifying chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(songs.length / CHUNK_SIZE)}...`);

    const promises = chunk.map(async (song) => {
      const res = await verifyOgp(song);
      results.push(res);
      
      const statusIcon = (res.imageOk && res.htmlOk) ? '✅' : '❌';
      console.log(`  ${statusIcon} "${song.name}" (ID: ${song.youtube_id}) | Image: ${res.imageStatus} (${res.cacheHeader}, ${Math.round(res.imageSize / 1024)}KB) | HTML OGP: ${res.htmlOk ? 'OK' : 'FAIL'}`);
    });

    await Promise.all(promises);
    await new Promise((r) => setTimeout(r, 600)); // 600ms スリープでレート制限を回避
  }

  // レポート生成
  const total = results.length;
  const imageOkCount = results.filter(r => r.imageOk).length;
  const htmlOkCount = results.filter(r => r.htmlOk).length;
  const allOkCount = results.filter(r => r.imageOk && r.htmlOk).length;
  const failedList = results.filter(r => !r.imageOk || !r.htmlOk);

  let report = `# SLAPS 全曲 OGP 一括検証レポート
*実行日時: ${new Date().toISOString()}*
*検証環境: https://slaps.tokyo/ (本番環境)*
*検証スクリプト: verify_all_ogp.js*

## 📊 総合サマリー
- **総検証楽曲数**: ${total} 曲
- **OGP画像正常生成 (検証A) 合格率**: ${imageOkCount} / ${total} (${Math.round(imageOkCount/total*100)}%)
- **HTML OGPタグ設定 (検証B) 合格率**: ${htmlOkCount} / ${total} (${Math.round(htmlOkCount/total*100)}%)
- **完全合格率 (検証A&B両方PASS)**: **${allOkCount} / ${total} (${Math.round(allOkCount/total*100)}%)**

## 📋 不合格（エラー/不整合）楽曲リスト
`;

  if (failedList.length === 0) {
    report += `\n**✨ 素晴らしい！不合格楽曲は 0 件です。全曲が正常に OGP 画像生成および設定をクリアしています。**\n`;
  } else {
    report += `\n| No | 楽曲名 | YouTube ID | 画像ステータス (検証A) | HTML OGP (検証B) | キャッシュ状態 | 詳細エラー |\n`;
    report += `|---|--------|------------|---------------------|------------------|--------------|-----------|\n`;
    failedList.forEach((r, idx) => {
      report += `| ${idx + 1} | ${r.name} | [${r.youtube_id}](https://youtu.be/${r.youtube_id}) | ${r.imageOk ? '✅' : `❌ (HTTP ${r.imageStatus}, ${Math.round(r.imageSize/1024)}KB)`} | ${r.htmlOk ? '✅' : '❌'} | ${r.cacheHeader} | ${r.error || '不整合'} |\n`;
    });
  }

  report += `\n## 📝 検証内容詳細

### 検証A (OGP画像APIの正常性)
- 対象: \`https://slaps.tokyo/api/og-image?v=動画ID\`
- 合格判定基準:
  1. ステータスコードが \`200\` であること
  2. \`content-type\` が \`image/jpeg\` であること
  3. 返却されたバイナリサイズが 0バイトより大きいこと

### 検証B (クローラー向け OGP設定の正常性)
- 対象: \`https://slaps.tokyo/?v=動画ID\` (User-Agentに Twitterbot を設定)
- 合格判定基準:
  1. HTMLレスポンス内に \`<meta property="og:title" content="Play on SLAPS">\` が含まれていること
  2. HTMLレスポンス内に \`Play on SLAPS | 曲名\` の形式で description がインジェクションされていること
  3. HTMLレスポンス内に \`content="https://slaps.tokyo/api/og-image?v=動画ID&ext=.jpg"\` が og:image として含まれていること

---
*Report generated by Antigravity*
`;

  const reportPath = '/Users/aokitakashi/Library/CloudStorage/GoogleDrive-takashi.aoki@sis21.net/マイドライブ/project/自分/obsidian/memo/Projects/SLAPS_全曲OGP一括検証レポート.md';
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`Verification complete! Report written to: ${reportPath}`);
}

main().catch(console.error);
