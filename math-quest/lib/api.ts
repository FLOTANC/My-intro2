import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession } from './session';

export async function requirePlayer(): Promise<number | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' },
  });
