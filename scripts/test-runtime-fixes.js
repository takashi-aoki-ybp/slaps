const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const uiSource = fs.readFileSync('src/ui.js', 'utf8');
const playerSource = fs.readFileSync('src/player.js', 'utf8');
const appSource = fs.readFileSync('script.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const toastStart = uiSource.indexOf('let toastTimer = null;');
const toastEnd = uiSource.indexOf('// ---- アイドル時UIを隠す ----', toastStart);
const toastSource = uiSource.slice(toastStart, toastEnd).replace(/^export /gm, '');
const classes = new Set();
const toast = {
  dataset: {},
  replaceChildren() {},
  append() {},
  classList: {
    add(value) { classes.add(value); },
    remove(value) { classes.delete(value); },
  },
};
const context = vm.createContext({
  $: () => toast,
  document: { createElement: () => ({}), createTextNode: value => value },
  setTimeout: () => 1,
  clearTimeout() {},
});
vm.runInContext(`${toastSource}\nthis.showToast = showToast; this.hideToast = hideToast;`, context);

context.showToast('YouTube failed', { key: 'youtube-timeout' });
assert.equal(classes.has('is-show'), true);
assert.equal(toast.dataset.toastKey, 'youtube-timeout');
assert.equal(context.hideToast('another-toast'), false, 'an unrelated toast must not be dismissed');
assert.equal(classes.has('is-show'), true);
assert.equal(context.hideToast('youtube-timeout'), true);
assert.equal(classes.has('is-show'), false);

assert.match(appSource, /showToast\(window\.i18n\.t\('toastYtFail'\), \{ key: 'youtube-timeout' \}\)/);
assert.match(playerSource, /onReady:\s*\(\) => \{[\s\S]*?hideToast\('youtube-timeout'\)/);
assert.match(html, /<button type="button" class="volume-control__icon" id="volumeIcon"[^>]*aria-pressed="false"/);
assert.match(html, /class="daily-date-nav" role="group" aria-label="Daily archive"/);

console.log('Runtime recovery and semantic-control regressions passed.');
