import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';
import { canBuy } from '@/lib/avatar';

export async function POST(req: Request) {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const { itemId } = await req.json().catch(() => ({}));
  if (typeof itemId !== 'string') return json({ ok: false, reason: 'unknown' }, 400);

  const [player] = await sql`
    select coins, streak, owned_items, defeated_bosses from player where id = ${pid}`;
  if (!player) return json({ ok: false }, 401);
  const [starRow] = await sql`
    select coalesce(sum(stars), 0)::int as total from progress where player_id = ${pid}`;

  const owned: string[] = player.owned_items ?? [];
  const check = canBuy(itemId, player.coins, owned, {
    totalStars: starRow.total, streak: player.streak,
    defeatedBosses: player.defeated_bosses ?? [],
  });
  if (!check.ok) return json({ ok: false, reason: check.reason }, 400);

  // コインが足りるときだけ引く。二重タップでも二重には引かれない
  const rows = await sql`
    update player
    set coins = coins - ${check.price},
        owned_items = array_append(owned_items, ${itemId})
    where id = ${pid} and coins >= ${check.price}
      and not (${itemId} = any(owned_items))
    returning coins, owned_items`;
  if (rows.length === 0) return json({ ok: false, reason: 'poor' }, 400);
  return json({ ok: true, coins: rows[0].coins, ownedItems: rows[0].owned_items });
}
