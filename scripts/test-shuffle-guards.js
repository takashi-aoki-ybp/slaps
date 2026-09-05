// Check the tests, not just the implementation. All injected defects are
// isolated source strings in VM contexts. Never overwrite working-tree files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const regression = fs.readFileSync('scripts/test-shuffle.js', 'utf8');
const state = fs.readFileSync('src/state.js', 'utf8');
const ui = fs.readFileSync('src/ui.js', 'utf8');
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'Mutation must match exactly one source location');
  return source.replace(before, after);
}
function check(stateSource, uiSource = ui) {
  vm.runInNewContext(regression, {
    URLSearchParams,
    require(name) {
      if (name !== 'node:fs') return require(name);
      return { ...fs, readFileSync(file, ...args) {
        if (file === 'src/state.js') return stateSource;
        if (file === 'src/ui.js') return uiSource;
        return fs.readFileSync(file, ...args);
      } };
    },
    console: { log() {} },
  }, { timeout: 10000 });
}
check(state);
const faults = [
  ['history weighting', 'else shuffleQueue(arr, avoidId);',
    'else { shuffleQueue(arr, avoidId); arr.sort((a,b)=>Number(state.played?.has(a.youtube_id))-Number(state.played?.has(b.youtube_id))); }'],
  ['no randomization', '  shuffle(arr);', '  /* injected defect: keep input order */'],
  ['fixed cycle', '      shuffleQueue(after, current()?.youtube_id);', '      /* injected defect: reuse cycle order */'],
  ['immediate repeat', 'arr.length > 1 && avoidId && arr[0].youtube_id === avoidId', 'arr.length < 0'],
  ['hidden short pool', 'else shuffleQueue(arr, avoidId);', 'else { shuffleQueue(arr, avoidId); arr.splice(20); }'],
  ['reversed LATEST', 'songTime(b) - songTime(a)', 'songTime(a) - songTime(b)'],
];
for (const [name, before, after] of faults) {
  const faultySource = replaceOnce(state, before, after);
  assert.throws(() => check(faultySource), error => error.code === 'ERR_ASSERTION', `${name} must fail a regression assertion, not merely crash`);
  console.log(`Guard rejected: ${name}`);
}
const staleCount = replaceOnce(ui, 'if (wasSpecial) updateTrackCount();', '/* injected defect: stale displayed count */');
assert.throws(() => check(state, staleCount), error => error.code === 'ERR_ASSERTION');
console.log('Guard rejected: stale displayed count');
console.log('Shuffle guard self-check passed: healthy code accepted, 7 injected regressions rejected.');
