const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');

// コピーするファイルとディレクトリのリスト
const targets = [
  'index.html',
  'styles.css',
  'script.js',
  'i18n.js',
  'manifest.json',
  'service-worker.js',
  'assets',
  'data',
  'api',
  'src'
];

// 出力先ディレクトリの初期化
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

for (const target of targets) {
  const srcPath = path.join(srcDir, target);
  const destPath = path.join(destDir, target);
  if (fs.existsSync(srcPath)) {
    copyRecursive(srcPath, destPath);
    console.log(`Copied: ${target}`);
  } else {
    console.warn(`Warning: Target not found: ${target}`);
  }
}

console.log('Build completed. Web assets are ready in "www".');
