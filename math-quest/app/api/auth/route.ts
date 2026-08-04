import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import { hashCode, verifyCode, signSession, SESSION_COOKIE } from '@/lib/session';
import { json } from '@/lib/api';

export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== 'string' || code.trim().length < 3)
    return json({ ok: false, error: 'あいことばは3もじいじょうにしてね' }, 400);

  const families = await sql`select id, code_hash from family limit 1`;
  let playerId: number;

  if (families.length === 0) {
    const fam = await sql`insert into family (code_hash) values (${hashCode(code)}) returning id`;
    const pl = await sql`insert into player (family_id) values (${fam[0].id}) returning id`;
    playerId = pl[0].id;
  } else {
    if (!verifyCode(code, families[0].code_hash))
      return json({ ok: false, error: 'あいことばがちがうみたい' }, 401);
    const pl = await sql`select id from player where family_id = ${families[0].id} limit 1`;
    playerId = pl[0].id;
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(playerId), {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, path: '/',
  });
  return json({ ok: true });
}
