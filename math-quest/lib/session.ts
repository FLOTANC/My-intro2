import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'mq_session';

export function hashCode(code: string): string {
  const salt = randomBytes(16).toString('hex');
  const h = scryptSync(code.normalize('NFKC'), salt, 32).toString('hex');
  return `${salt}:${h}`;
}

export function verifyCode(code: string, stored: string): boolean {
  const [salt, h] = stored.split(':');
  // 64桁hex以外は不正（長さ違いでtimingSafeEqualが例外を投げるのを防ぐ）
  if (!salt || !h || !/^[0-9a-f]{64}$/.test(h)) return false;
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
  // sigは64桁hex限定（マルチバイト文字などでtimingSafeEqualが例外を投げるのを防ぐ）
  if (!id || !sig || !/^\d+$/.test(id) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const expect = hmac(id);
  if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expect, 'hex'))) return null;
  return Number(id);
}
