import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';
import { todayJST } from '@/lib/streak';

export async function GET() {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const [player] = await sql`
    select coins, streak, last_play_date::text, current_stage from player where id = ${pid}`;
  if (!player) return json({ ok: false }, 401);
  const cleared = await sql`select stage_id, stars from progress where player_id = ${pid}`;
  const reviews = await sql`
    select id, problem from mistakes
    where player_id = ${pid} and graduated = false
    order by created_at asc limit 3`;
  return json({
    ok: true,
    coins: player.coins, streak: player.streak,
    lastPlayDate: player.last_play_date, currentStage: player.current_stage,
    clearedStages: cleared.map(c => ({ stageId: c.stage_id, stars: c.stars })),
    missionDoneToday: player.last_play_date === todayJST(),
    reviewProblems: reviews.map(r => ({ id: r.id, problem: r.problem })),
  });
}
