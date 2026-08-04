import { beforeAll, expect, test } from 'vitest';
import { hashCode, verifyCode, signSession, verifySession } from '@/lib/session';

beforeAll(() => { process.env.SESSION_SECRET = 'test-secret'; });

test('hashCode/verifyCode', () => {
  const h = hashCode('りんご325');
  expect(h).not.toContain('りんご');
  expect(verifyCode('りんご325', h)).toBe(true);
  expect(verifyCode('りんご326', h)).toBe(false);
});

test('signSession/verifySession', () => {
  const t = signSession(42);
  expect(verifySession(t)).toBe(42);
  expect(verifySession(t + 'x')).toBeNull();
  expect(verifySession('12.abcdef')).toBeNull();
});
