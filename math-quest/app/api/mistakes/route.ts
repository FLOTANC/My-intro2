import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';

export async function GET() {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const active = await sql`
    select id, problem, wrong_answer from mistakes
    where player_id = ${pid} and graduated = false
    order by created_at asc limit 50`;
  const [g] = await sql`
    select count(*)::int as c from mistakes where player_id = ${pid} and graduated = true`;
  return json({
    ok: true,
    active: active.map(m => ({ id: m.id, problem: m.problem, wrongAnswer: m.wrong_answer })),
    graduatedCount: g.c,
  });
}
