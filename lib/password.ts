import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';

// OWASP's scrypt minimum N=2^14, r=8, p=5. Never lower this to fit a CPU quota.
const N = 16384, r = 8, p = 5;
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 32, { N, r, p, maxmem: 32 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
export function randomToken() { return randomBytes(32).toString('base64url'); }
export function tokenHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function constantEqual(a: string, b: string) { return timingSafeEqual(Buffer.from(tokenHash(a), 'hex'), Buffer.from(tokenHash(b), 'hex')); }
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${N}$${r}$${p}$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split('$');
  const valid = parts.length === 6 && parts[0] === 'scrypt' && parts[1] === String(N) && parts[2] === String(r) && parts[3] === String(p) && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{64}$/.test(parts[5]);
  // Still perform the expensive operation for unknown usernames/corrupt hashes.
  const key = await derive(password, valid ? parts[4] : '00000000000000000000000000000000');
  return timingSafeEqual(key, Buffer.from(valid ? parts[5] : '0'.repeat(64), 'hex')) && valid;
}
