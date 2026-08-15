import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';
import { equipItem, normalizeEquipped } from '@/lib/avatar';

export async function POST(req: Request) {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const { itemId } = await req.json().catch(() => ({}));
  if (typeof itemId !== 'string') return json({ ok: false }, 400);

  const [player] = await sql`select owned_items, equipped from player where id = ${pid}`;
  if (!player) return json({ ok: false }, 401);
  const owned: string[] = player.owned_items ?? [];
  const current = normalizeEquipped(player.equipped, owned);
  const next = equipItem(current, itemId, owned);
  if (!next) return json({ ok: false }, 400);

  await sql`update player set equipped = ${JSON.stringify(next)}::jsonb where id = ${pid}`;
  return json({ ok: true, equipped: next });
}
