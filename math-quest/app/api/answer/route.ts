import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';

export async function POST(req: Request) {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const { problem, correct, wrongAnswer, coins, mistakeId } = await req.json().catch(() => ({}));
  if (typeof correct !== 'boolean' || typeof coins !== 'number' || coins < 0 || coins > 100)
    return json({ ok: false }, 400);

  let graduated = false;
  if (mistakeId != null) {
    if (correct) {
      const [row] = await sql`
        update mistakes set correct_streak = correct_streak + 1,
          graduated = (correct_streak + 1 >= 2)
        where id = ${mistakeId} and player_id = ${pid}
        returning graduated`;
      graduated = row?.graduated ?? false;
    } else {
      await sql`update mistakes set correct_streak = 0
        where id = ${mistakeId} and player_id = ${pid}`;
    }
  } else if (!correct && problem) {
    await sql`insert into mistakes (player_id, problem, wrong_answer)
      values (${pid}, ${JSON.stringify(problem)}, ${String(wrongAnswer ?? '')})`;
  }
  const [p] = await sql`
    update player set coins = coins + ${correct ? coins : 0}
    where id = ${pid} returning coins`;
  return json({ ok: true, coins: p.coins, graduated });
}
