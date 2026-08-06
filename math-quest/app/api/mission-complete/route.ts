import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';
import { todayJST, nextStreak } from '@/lib/streak';

const DAILY_BONUS = 50;

export async function POST() {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const today = todayJST();
  const [p] = await sql`
    select streak, coins, last_play_date::text from player where id = ${pid}`;
  if (!p) return json({ ok: false }, 401);
  const streak = nextStreak(p.last_play_date, today, p.streak);
  // 同日2回目はWHERE句で弾く（二重リクエストでもボーナスは1日1回だけ）
  const rows = await sql`
    update player set streak = ${streak}, last_play_date = ${today},
      coins = coins + ${DAILY_BONUS}
    where id = ${pid} and last_play_date is distinct from ${today}
    returning streak, coins`;
  if (rows.length === 0)
    return json({ ok: true, streak: p.streak, coins: p.coins, bonus: 0 });
  return json({ ok: true, streak: rows[0].streak, coins: rows[0].coins, bonus: DAILY_BONUS });
}
