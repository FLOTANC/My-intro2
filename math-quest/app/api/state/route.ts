import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';
import { todayJST } from '@/lib/streak';
import { normalizeEquipped } from '@/lib/avatar';

export async function GET() {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const [player] = await sql`
    select coins, streak, last_play_date::text, current_stage, owned_items, equipped, defeated_bosses
    from player where id = ${pid}`;
  if (!player) return json({ ok: false }, 401);
  const cleared = await sql`select stage_id, stars from progress where player_id = ${pid}`;
  // ランダムに選ぶ：毎日おなじ苦手3問だけが出続けて心が折れるのを防ぐ
  const reviews = await sql`
    select id, problem from mistakes
    where player_id = ${pid} and graduated = false
    order by random() limit 3`;
  const ownedItems: string[] = player.owned_items ?? [];
  const totalStars = cleared.reduce((sum, c) => sum + c.stars, 0);
  return json({
    ok: true,
    coins: player.coins, streak: player.streak,
    lastPlayDate: player.last_play_date, currentStage: player.current_stage,
    clearedStages: cleared.map(c => ({ stageId: c.stage_id, stars: c.stars })),
    missionDoneToday: player.last_play_date === todayJST(),
    reviewProblems: reviews.map(r => ({ id: r.id, problem: r.problem })),
    ownedItems,
    equipped: normalizeEquipped(player.equipped, ownedItems),
    totalStars,
    defeatedBosses: player.defeated_bosses ?? [],
  });
}
