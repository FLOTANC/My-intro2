import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'mq_session';

export function hashCode(code: string): string {
  const salt = randomBytes(16).toString('hex');
  const h = scryptSync(code.normalize('NFKC'), salt, 32).toString('hex');
  return `${salt}:${h}`;
}

export function verifyCode(code: string, stored: string): boolean {
  const [salt, h] = stored.split(':');
  if (!salt || !h) return false;
  const got = scryptSync(code.normalize('NFKC'), salt, 32);
  return timingSafeEqual(got, Buffer.from(h, 'hex'));
}

const hmac = (msg: string) =>
  createHmac('sha256', process.env.SESSION_SECRET!).update(msg).digest('hex');

export function signSession(playerId: number): string {
  return `${playerId}.${hmac(String(playerId))}`;
}

export function verifySession(token: string | undefined): number | null {
  if (!token) return null;
  const [id, sig] = token.split('.');
  if (!id || !sig || !/^\d+$/.test(id)) return null;
  const expect = hmac(id);
  if (sig.length !== expect.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  return Number(id);
}
