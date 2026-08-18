import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';
import { nextStageId, stageById } from '@/lib/stages';
import { bossWorldOf } from '@/lib/battle';

export async function POST(req: Request) {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const { stageId, stars, defeated } = await req.json().catch(() => ({}));
  if (!stageById(stageId) || ![1, 2, 3].includes(stars)) return json({ ok: false }, 400);

  await sql`
    insert into progress (player_id, stage_id, stars) values (${pid}, ${stageId}, ${stars})
    on conflict (player_id, stage_id)
    do update set stars = greatest(progress.stars, ${stars}), cleared_at = now()`;

  const next = nextStageId(stageId);
  const [p] = await sql`select current_stage from player where id = ${pid}`;
  if (!p) return json({ ok: false }, 401);
  if (next && p.current_stage === stageId) {
    await sql`update player set current_stage = ${next} where id = ${pid}`;
  }

  // ボスを倒したワールドを重複なく記録する
  const bossWorld = bossWorldOf(stageId);
  if (bossWorld !== null && defeated === true) {
    await sql`update player
      set defeated_bosses = array_append(defeated_bosses, ${bossWorld})
      where id = ${pid} and not (${bossWorld} = any(defeated_bosses))`;
  }

  return json({ ok: true, nextStage: next });
}
