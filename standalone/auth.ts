import { constantEqual, hashPassword, randomToken, tokenHash, verifyPassword } from '../lib/password';

export interface AuthEnv { DB: D1Database; SETUP_TOKEN?: string }
type User = { id: string; name: string };
type StoredUser = User & { username: string; password_hash: string; recovery_hash: string };
const cookieName = 'suixing_session';
const sessionSeconds = 30 * 24 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);
function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', ...extra } });
}
function cookie(request: Request, value: string, seconds = sessionSeconds) {
  const url = new URL(request.url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return `${cookieName}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; SameSite=Strict${local && url.protocol === 'http:' ? '' : '; Secure'}`;
}
function sessionToken(request: Request) {
  const value = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export async function getSessionUser(request: Request, env: AuthEnv): Promise<User | null> {
  const token = sessionToken(request);
  if (!token) return null;
  return env.DB.prepare('SELECT u.id,u.name FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(tokenHash(token), now()).first<User>();
}
async function limited(request: Request, env: AuthEnv, action: string, username: string) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const bucket = Math.floor(now() / 900);
  const limits = [{ key: `ip:${action}:${tokenHash(ip)}`, max: action === 'login' ? 20 : 5 }];
  if (action !== 'setup') limits.push({ key: `account:${action}:${tokenHash(username)}`, max: action === 'login' ? 10 : 5 });
  const results = await env.DB.batch(limits.map(({ key }) => env.DB.prepare('INSERT INTO auth_limits(rate_key,bucket,attempts) VALUES(?,?,1) ON CONFLICT(rate_key) DO UPDATE SET attempts=CASE WHEN auth_limits.bucket=excluded.bucket THEN auth_limits.attempts+1 ELSE 1 END,bucket=excluded.bucket RETURNING attempts').bind(key, bucket)));
  // Each increment is atomic; concurrent requests cannot share an allowed attempt.
  return results.some((result, index) => Number((result.results[0] as { attempts: number })?.attempts || Infinity) > limits[index].max);
}
async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('body');
  if (Number(request.headers.get('content-length')) > 8192) throw new Error('size');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 8192) { await reader.cancel(); throw new Error('size'); } chunks.push(value); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body');
  return body as Record<string, unknown>;
}
const validPassword = (value: unknown): value is string => typeof value === 'string' && value.length >= 12 && value.length <= 128;
const publicUser = (user: User) => ({ id: user.id, name: user.name });
async function issueSession(request: Request, env: AuthEnv, user: User, expectedRecoveryHash: string, recoveryCode?: string) {
  const token = randomToken();
  const results = await env.DB.batch([
    env.DB.prepare('DELETE FROM app_sessions WHERE expires_at<=?').bind(now()),
    env.DB.prepare('DELETE FROM auth_limits WHERE bucket<?').bind(Math.floor(now() / 900) - 2),
    env.DB.prepare('INSERT INTO app_sessions(token_hash,user_id,expires_at) SELECT ?,id,? FROM app_users WHERE id=? AND recovery_hash=? RETURNING token_hash').bind(tokenHash(token), now() + sessionSeconds, user.id, expectedRecoveryHash),
  ]);
  if (!results[2].results.length) return json({ error: '账号凭据已更新，请重新登录' }, 401);
  return json({ user: publicUser(user), ...(recoveryCode ? { recoveryCode } : {}) }, 200, { 'Set-Cookie': cookie(request, token) });
}
export async function handleAuth(request: Request, env: AuthEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/auth/')) return null;
  try {
    if (path === '/api/auth/session' && request.method === 'GET') {
      const user = await getSessionUser(request, env);
      const exists = await env.DB.prepare('SELECT id FROM app_users LIMIT 1').first();
      return json({ user, configured: Boolean(exists), setupRequired: !exists, setupEnabled: Boolean(env.SETUP_TOKEN && env.SETUP_TOKEN.length >= 32) });
    }
    if (!['/api/auth/setup', '/api/auth/login', '/api/auth/logout', '/api/auth/recover'].includes(path)) return json({ error: '接口不存在' }, 404);
    if (request.method !== 'POST') return json({ error: '请求方式不支持' }, 405, { Allow: 'POST' });
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: '请求来源不匹配' }, 403);
    if (path === '/api/auth/logout') {
      const token = sessionToken(request);
      if (token) await env.DB.prepare('DELETE FROM app_sessions WHERE token_hash=?').bind(tokenHash(token)).run();
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) });
    }
    let input: Record<string, unknown>;
    try { input = await readBody(request); } catch (error) { return json({ error: error instanceof Error && error.message === 'size' ? '请求内容过大' : '请求格式错误' }, error instanceof Error && error.message === 'size' ? 413 : 400); }
    const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
    const action = path.slice('/api/auth/'.length);
    if (await limited(request, env, action, username)) return json({ error: '尝试过于频繁，请 15 分钟后重试' }, 429, { 'Retry-After': '900' });
    if (!/^[a-z0-9_.-]{3,64}$/.test(username) || !validPassword(input.password)) return json({ error: '账号需为 3–64 位英文、数字或 _-.，密码需为 12–128 位' }, 400);
    if (action === 'setup') {
      if (!env.SETUP_TOKEN || env.SETUP_TOKEN.length < 32 || typeof input.token !== 'string' || !constantEqual(input.token, env.SETUP_TOKEN)) return json({ error: '初始化凭据无效' }, 403);
      const name = typeof input.name === 'string' ? input.name.trim() : username;
      if (!name || name.length > 64) return json({ error: '昵称需为 1–64 个字符' }, 400);
      const user = { id: crypto.randomUUID(), name };
      const recoveryCode = randomToken();
      const passwordHash = await hashPassword(input.password);
      // singleton UNIQUE prevents two concurrent setup requests creating two users.
      const created = await env.DB.prepare('INSERT INTO app_users(id,username,name,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING id').bind(user.id, username, name, passwordHash, tokenHash(recoveryCode), now()).first();
      if (!created) return json({ error: '个人账号已创建，请登录' }, 409);
      return issueSession(request, env, user, tokenHash(recoveryCode), recoveryCode);
    }
    const user = await env.DB.prepare('SELECT id,name,username,password_hash,recovery_hash FROM app_users WHERE username=?').bind(username).first<StoredUser>();
    if (action === 'login') {
      if (!await verifyPassword(input.password, user?.password_hash || '') || !user) return json({ error: '账号或密码不正确' }, 401);
      return issueSession(request, env, user, user.recovery_hash);
    }
    if (typeof input.recoveryCode !== 'string' || input.recoveryCode.length > 128 || !user || !constantEqual(tokenHash(input.recoveryCode), user.recovery_hash)) return json({ error: '账号或恢复码不正确' }, 401);
    const recoveryCode = randomToken(), passwordHash = await hashPassword(input.password);
    // Batch transaction plus CAS prevents reuse of a recovery code in a race.
    const updated = await env.DB.batch([
      env.DB.prepare('UPDATE app_users SET password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=? RETURNING id').bind(passwordHash, tokenHash(recoveryCode), user.id, user.recovery_hash),
      env.DB.prepare('DELETE FROM app_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM app_users WHERE id=? AND recovery_hash=?)').bind(user.id, user.id, tokenHash(recoveryCode)),
    ]);
    if (!updated[0].results.length) return json({ error: '账号或恢复码不正确' }, 401);
    return issueSession(request, env, user, tokenHash(recoveryCode), recoveryCode);
  } catch {
    return json({ error: '服务暂时不可用，请稍后重试' }, 503);
  }
}
