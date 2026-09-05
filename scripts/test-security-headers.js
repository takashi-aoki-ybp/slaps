const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'));
const globalHeaders = config.headers?.find(rule => rule.source === '/(.*)')?.headers || [];
const headers = Object.fromEntries(globalHeaders.map(({ key, value }) => [key.toLowerCase(), value]));

assert.equal(headers['x-content-type-options'], 'nosniff');
assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
assert.equal(headers['x-frame-options'], 'DENY');
assert.match(headers['permissions-policy'], /autoplay=\(self "https:\/\/www\.youtube\.com"\)/);
assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
assert.match(headers['content-security-policy'], /frame-src https:\/\/www\.youtube\.com/);
assert.match(headers['content-security-policy'], /connect-src[^;]*https:\/\/itunes\.apple\.com/);
assert.match(headers['content-security-policy'], /connect-src[^;]*https:\/\/noembed\.com/);
assert.match(headers['content-security-policy'], /script-src[^;]*https:\/\/www\.googletagmanager\.com/);
assert.doesNotMatch(headers['content-security-policy'], /default-src \*/);

console.log('Security header configuration passed.');
