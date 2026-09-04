const assert = require('assert/strict');
const { readRedisList } = require('../api/utils/kv-list.js');

async function run() {
  const source = Array.from({ length: 205 }, (_, index) => `row-${index}`);
  const commands = [];
  const kvFetch = async (command) => {
    commands.push(command);
    return source.slice(Number(command[2]), Number(command[3]) + 1);
  };

  const rows = await readRedisList(kvFetch, 'prod:slaps:songs');
  assert.deepEqual(rows, source);
  assert.deepEqual(commands, [
    ['LRANGE', 'prod:slaps:songs', '0', '99'],
    ['LRANGE', 'prod:slaps:songs', '100', '199'],
    ['LRANGE', 'prod:slaps:songs', '200', '299'],
  ]);
  assert.ok(commands.every((command) => command[3] !== '-1'));

  await assert.rejects(
    () => readRedisList(async () => Array(2).fill('row'), 'oversized', { batchSize: 2, maxItems: 4 }),
    /exceeded safe read limit/,
  );

  console.log('Redis list pagination tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
