import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';

// Runs the real handler, scrypt implementation, and SQL in workerd/D1; no mocks.
const root = new URL('../', import.meta.url);
const { outputFiles } = await build({
  stdin: { contents: `import {handleAuth} from './standalone/auth'; export default {async fetch(request,env){return await handleAuth(request,env)||new Response('missing',{status:404})}}`, resolveDir: fileURLToPath(root), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['node:crypto'], target: 'es2022',
});
const setupToken = randomBytes(32).toString('base64url');
const password = randomBytes(24).toString('base64url');
const nextPassword = randomBytes(24).toString('base64url');
const mf = new Miniflare({ modules: true, script: outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { SETUP_TOKEN: setupToken }, log: undefined });
try {
  const db = await mf.getD1Database('DB');
  const sql = (await readFile(new URL('../drizzle/0001_standalone_auth.sql', import.meta.url), 'utf8')).replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
  await db.exec(sql); await db.exec(sql);
  let ip = '192.0.2.1';
  const send = async (path, body, options = {}) => {
    const response = await mf.dispatchFetch(`https://auth.example/api/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://auth.example', 'CF-Connecting-IP': ip, ...options.headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { response, status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  assert.equal((await send('session')).data.setupRequired, true);
  assert.equal((await send('setup', { username: 'owner', password, token: setupToken }, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await send('setup', { username: 'owner', password, token: 'invalid' })).status, 403);
  const started = performance.now();
  const setup = await send('setup', { username: 'owner', name: '测试用户', password, token: setupToken });
  assert.equal(setup.status, 200, 'scrypt must run in workerd');
  const elapsed = Math.round(performance.now() - started);
  assert.equal(typeof setup.data.recoveryCode, 'string');
  assert.match(setup.response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Secure/);
  assert.equal((await send('session', undefined, { headers: { cookie: setup.cookie } })).data.user.id, setup.data.user.id);
  assert.equal((await send('setup', { username: 'other', password, token: setupToken })).status, 409);
  assert.equal((await send('login', { username: 'owner', password: 'wrong-password-with-length' })).status, 401);
  const login = await send('login', { username: 'OWNER', password });
  assert.equal(login.status, 200); assert.equal(login.data.recoveryCode, undefined);
  const recovery = await send('recover', { username: 'owner', password: nextPassword, recoveryCode: setup.data.recoveryCode });
  assert.equal(recovery.status, 200); assert.notEqual(recovery.data.recoveryCode, setup.data.recoveryCode);
  assert.equal((await send('session', undefined, { headers: { cookie: login.cookie } })).data.user, null);
  assert.equal((await send('session', undefined, { headers: { cookie: setup.cookie } })).data.user, null);
  assert.equal((await send('recover', { username: 'owner', password, recoveryCode: setup.data.recoveryCode })).status, 401);
  assert.equal((await send('login', { username: 'owner', password })).status, 401);
  const fresh = await send('login', { username: 'owner', password: nextPassword });
  assert.equal(fresh.status, 200);
  assert.equal((await send('logout', {}, { headers: { cookie: fresh.cookie } })).status, 200);
  assert.equal((await send('session', undefined, { headers: { cookie: fresh.cookie } })).data.user, null);
  const racingRecovery = await Promise.all(Array.from({ length: 2 }, () => send('recover', { username: 'owner', password, recoveryCode: recovery.data.recoveryCode })));
  assert.deepEqual(racingRecovery.map(r => r.status).sort(), [200, 401], 'single-use recovery is atomic');
  assert.equal((await send('session', undefined, { headers: { cookie: recovery.cookie } })).data.user, null);
  const latest = racingRecovery.find(r => r.status === 200);
  assert.equal((await send('session', undefined, { headers: { cookie: latest.cookie } })).data.configured, true);
  await db.prepare('UPDATE app_sessions SET expires_at=0').run();
  assert.equal((await send('session', undefined, { headers: { cookie: latest.cookie } })).data.user, null);
  const rows = await db.prepare('SELECT password_hash,recovery_hash FROM app_users').all();
  assert.equal(rows.results.length, 1);
  assert.match(rows.results[0].password_hash, /^scrypt\$16384\$8\$5\$/);
  assert.notEqual(rows.results[0].recovery_hash, recovery.data.recoveryCode);
  const sessions = await db.prepare('SELECT token_hash FROM app_sessions').all();
  assert(sessions.results.every(row => /^[0-9a-f]{64}$/.test(row.token_hash)));
  // A different username uses its own account limit; concurrent increments still cap at 10.
  ip = '192.0.2.2';
  const concurrent = await Promise.all(Array.from({ length: 14 }, () => send('login', { username: 'missing', password })));
  assert.equal(concurrent.filter(r => r.status === 401).length, 10);
  assert.equal(concurrent.filter(r => r.status === 429).length, 4);
  // Attack many usernames from one IP: the independent IP cap still applies.
  const ipLimited = await Promise.all(Array.from({ length: 9 }, (_, i) => send('recover', { username: `other${i}`, password, recoveryCode: 'nope' })));
  assert.equal(ipLimited.filter(r => r.status === 401).length, 5);
  assert.equal(ipLimited.filter(r => r.status === 429).length, 4);
  const oversized = await send('login', { username: 'owner', password, extra: 'x'.repeat(9000) });
  assert.equal(oversized.status, 413);
  console.log(`PASS: real workerd scrypt (${elapsed}ms setup wall time), idempotent D1 migration, single account, session cookies, recovery rotation/revocation, logout, atomic account/IP limits, CSRF, body limit. No credentials printed.`);
} finally { await mf.dispose(); }
