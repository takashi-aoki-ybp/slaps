const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/state.js', 'utf8').replace(/^export /gm, '');
let draws = [];
let calls = 0;
const storageAccess = [];
const math = Object.create(Math);
math.random = () => { calls++; return draws.length ? draws.shift() : 0.25; };
const ctx = vm.createContext({ Math: math, URLSearchParams,
  window: { location: { search: '' } },
  localStorage: {
    getItem(key) { storageAccess.push(key); return key === 'slaps_played' ? '["a","b"]' : null; },
    setItem() { throw Error('Shuffle must not write persistent history'); },
  },
});
vm.runInContext(source, ctx);
const run = code => vm.runInContext(code, ctx);
const ids = () => JSON.parse(run('JSON.stringify(state.queue.map(s => s.youtube_id))'));
const reset = () => run(`state.all = [
  {youtube_id:'a',region:'jp',era:'90s',created_at:'2020-01-01'},
  {youtube_id:'b',region:'us',era:'10s',created_at:'2022-01-01'},
  {youtube_id:'c',region:'jp',era:'10s',created_at:'2021-01-01'}
]; state.region='all'; state.era='all'; state.order='shuffle';
state.crateMode=false; state.dailyMode=false; state.favMode=false;
state.queue=state.all.slice(); state.index=0; applyOrder([]);`);
reset();
assert(!storageAccess.includes('slaps_played'));
assert(!storageAccess.includes('slaps_recent'));

// Exhaust all Fisher-Yates choices: each of the six permutations exactly once,
// even if an old in-memory history survives an upgrade.
run("state.played=new Set(['a','b']); state.recent=['a'];");
const permutations = new Set();
for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) {
  draws = [(j + 0.1) / 3, (k + 0.1) / 2];
  run('state.queue=state.all.slice(); applyOrder(state.queue)');
  const order = ids();
  assert.deepEqual([...order].sort(), ['a', 'b', 'c']);
  permutations.add(order.join(''));
}
assert.equal(permutations.size, 6);

// Catalog-scale check: no hidden short list; identical random draws must yield
// identical results regardless of persistent/in-memory legacy history.
reset();
run("state.all=Array.from({length:1007},(_,i)=>({youtube_id:'track-'+i}));state.queue=state.all.slice();state.played=new Set();state.recent=[]");
draws=Array(1006).fill(0.37);run('applyOrder(state.queue)');
const fullCatalog=ids();
assert.equal(fullCatalog.length,1007);assert.equal(new Set(fullCatalog).size,1007);
run("state.queue=state.all.slice();state.played=new Set(state.all.slice(5).map(s=>s.youtube_id));state.recent=state.all.slice(5,15).map(s=>s.youtube_id)");
draws=Array(1006).fill(0.37);run('applyOrder(state.queue)');
assert.deepEqual(ids(),fullCatalog,'Old history must not affect catalog shuffle');

reset();
const original = ids(); const beforeBackward = calls;
run('advanceQueue(-1); advanceQueue(1)');
assert.deepEqual(ids(), original); assert.equal(run('state.index'), 0);
assert.equal(calls, beforeBackward, 'Initial PREV then NEXT must not reshuffle');
run('state.index=2;advanceQueue(1)');
assert(calls > beforeBackward, 'Normal completion still reshuffles afterwards');

reset(); draws = [0.99, 0.99, 0.1];
run("applyOrder(state.queue, 'a')");
assert.notEqual(ids()[0], 'a');
assert.deepEqual(ids().sort(), ['a', 'b', 'c']);

reset(); run('state.index=2');
const old = ids(); const initialCalls = calls;
draws = [0, 0]; run('advanceQueue(1)');
const fresh = ids();
assert(calls > initialCalls, 'At the end, actually draw a new shuffle');
assert.notDeepEqual(fresh, old);
assert.equal(run('state.index'), 0);
assert.notEqual(fresh[0], old[2]);
assert.deepEqual([...fresh].sort(), [...old].sort());
run('advanceQueue(-1)');
assert.deepEqual(ids(), old); assert.equal(run('state.index'), 2);
const beforeReturn = calls; run('advanceQueue(1)');
assert.deepEqual(ids(), fresh); assert.equal(calls, beforeReturn);
run('advanceQueue(1); advanceQueue(-1)');
assert.equal(run('state.index'), 0);
run('state.index=2; advanceQueue(1)');
assert(calls > beforeReturn, 'Another completed cycle also reshuffles');

// Filter changes and a new explicit shuffle discard stale navigation cycles.
run("state.region='jp';state.era='10s';state.queue=eligibleByBalance(2.5);applyOrder(state.queue);state.index=0;advanceQueue(-1)");
assert.deepEqual(ids(), ['c']); assert.equal(run('state.index'), 0);
reset(); run("state.broken.add('b'); state.region='jp';state.queue=eligibleByBalance(2.5);applyOrder(state.queue)");
assert.deepEqual(ids().sort(), ['a','c']);

for (const mode of ['dailyMode', 'crateMode']) {
  reset(); run(`state.${mode}=true; applyOrder(state.queue); state.index=2`);
  const start = calls; run('advanceQueue(1)');
  assert.deepEqual(ids(), ['a','b','c']); assert.equal(calls, start);
  assert.equal(run('state.index'), 0);
}
reset(); run("state.order='newest';applyOrder(state.queue);state.index=2;advanceQueue(1)");
assert.deepEqual(ids(), ['b','c','a']); assert.equal(run('state.index'), 0);
reset(); run('state.favMode=true;state.queue=state.all.slice(0,2);applyOrder(state.queue);state.index=1;advanceQueue(1)');
assert.deepEqual(ids().sort(), ['a','b']);
reset(); run('state.queue=[];advanceQueue(1);advanceQueue(-1)'); assert.deepEqual(ids(), []);
run('state.queue=[state.all[0]];advanceQueue(1);advanceQueue(-1)');
assert.deepEqual(ids(), ['a']); assert.equal(run('state.index'), 0);

assert.match(fs.readFileSync('src/player.js', 'utf8'), /advanceQueue\(dir\)/);
assert.doesNotMatch(fs.readFileSync('src/player.js', 'utf8'), /savePlayed|saveRecent/);
const ui = fs.readFileSync('src/ui.js', 'utf8');
assert.match(ui.slice(ui.indexOf('function clearSpecialMode()'), ui.indexOf('const clearCrateMode')), /if \(wasSpecial\) updateTrackCount\(\)/);
console.log('Shuffle tests passed: equal weighting, no persistent history, fresh cycles, reversible boundary, filters and special queues.');
