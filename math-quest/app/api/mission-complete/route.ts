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
  if (p.last_play_date === today)
    return json({ ok: true, streak: p.streak, coins: p.coins, bonus: 0 });
  const streak = nextStreak(p.last_play_date, today, p.streak);
  const [u] = await sql`
    update player set streak = ${streak}, last_play_date = ${today},
      coins = coins + ${DAILY_BONUS}
    where id = ${pid} returning streak, coins`;
  return json({ ok: true, streak: u.streak, coins: u.coins, bonus: DAILY_BONUS });
}
