export type Slot = 'bg' | 'body' | 'clothes' | 'hair' | 'hat' | 'face';
export type Unlock =
  | { kind: 'stars'; count: number }
  | { kind: 'streak'; days: number }
  | { kind: 'boss'; world: number };
export type Item = {
  id: string; slot: Slot; name: string; price: number;
  shape?: string; color?: string; unlock?: Unlock;
};
export type Equipped = Record<Slot, string>;
export type PlayerStats = { totalStars: number; streak: number; defeatedBosses: number[] };

export const SLOTS: Slot[] = ['hair', 'hat', 'face', 'clothes', 'body', 'bg'];

export const SLOT_LABEL: Record<Slot, string> = {
  hair: '髪型', hat: '帽子', face: '顔',
  clothes: '服', body: '体', bg: '背景',
};

export const ITEMS: Item[] = [
  // はいけい
  { id: 'bg-night', slot: 'bg', name: '夜空', price: 0, color: '#1a1440' },
  { id: 'bg-sky', slot: 'bg', name: '青空', price: 80, color: '#38bdf8' },
  { id: 'bg-sunset', slot: 'bg', name: '夕焼け', price: 120, color: '#fb7185' },
  { id: 'bg-space', slot: 'bg', name: '宇宙', price: 300, color: '#0b1026',
    unlock: { kind: 'stars', count: 20 } },
  // からだ
  { id: 'body-peach', slot: 'body', name: 'はだ色', price: 0, color: '#f5c9a6' },
  { id: 'body-tan', slot: 'body', name: '小麦色', price: 60, color: '#c98b5e' },
  { id: 'body-robot', slot: 'body', name: 'ロボット', price: 250, color: '#94a3b8' },
  { id: 'body-slime', slot: 'body', name: 'スライム', price: 400, color: '#4ade80',
    unlock: { kind: 'streak', days: 7 } },
  // ふく
  { id: 'clothes-tshirt', slot: 'clothes', name: 'Tシャツ', price: 0, shape: 'tshirt', color: '#38bdf8' },
  { id: 'clothes-hoodie', slot: 'clothes', name: 'パーカー', price: 100, shape: 'hoodie', color: '#f472b6' },
  { id: 'clothes-dress', slot: 'clothes', name: 'ワンピース', price: 150, shape: 'dress', color: '#a78bfa' },
  { id: 'clothes-armor', slot: 'clothes', name: 'よろい', price: 350, shape: 'armor', color: '#cbd5e1',
    unlock: { kind: 'stars', count: 30 } },
  // かみがた
  { id: 'hair-short', slot: 'hair', name: 'ショート', price: 0, shape: 'short', color: '#3b2b1a' },
  { id: 'hair-spiky', slot: 'hair', name: 'ツンツン', price: 80, shape: 'spiky', color: '#1e293b' },
  { id: 'hair-long', slot: 'hair', name: 'ロング', price: 120, shape: 'long', color: '#7c3f14' },
  { id: 'hair-twin', slot: 'hair', name: 'ツインテール', price: 150, shape: 'twin', color: '#eab308' },
  // ぼうし
  { id: 'hat-none', slot: 'hat', name: 'なし', price: 0, shape: 'none' },
  { id: 'hat-cap', slot: 'hat', name: 'キャップ', price: 90, shape: 'cap', color: '#ef4444' },
  { id: 'hat-wizard', slot: 'hat', name: '魔法の帽子', price: 200, shape: 'wizard', color: '#7c3aed' },
  { id: 'hat-crown', slot: 'hat', name: '王冠', price: 500, shape: 'crown', color: '#ffb703',
    unlock: { kind: 'boss', world: 1 } },
  // かお
  { id: 'face-smile', slot: 'face', name: 'にこにこ', price: 0, shape: 'smile' },
  { id: 'face-cool', slot: 'face', name: 'クール', price: 70, shape: 'cool' },
  { id: 'face-glasses', slot: 'face', name: '眼鏡', price: 110, shape: 'glasses' },
  { id: 'face-star', slot: 'face', name: 'スターアイ', price: 220, shape: 'star',
    unlock: { kind: 'stars', count: 15 } },
];

export const ITEM_BY_ID: Record<string, Item> =
  Object.fromEntries(ITEMS.map(i => [i.id, i]));

export const DEFAULT_EQUIPPED: Equipped = {
  bg: 'bg-night', body: 'body-peach', clothes: 'clothes-tshirt',
  hair: 'hair-short', hat: 'hat-none', face: 'face-smile',
};

export function isOwned(id: string, owned: string[]): boolean {
  const item = ITEM_BY_ID[id];
  if (!item) return false;
  return item.price === 0 || owned.includes(id);
}

export function isUnlocked(item: Item, stats: PlayerStats): boolean {
  if (!item.unlock) return true;
  if (item.unlock.kind === 'stars') return stats.totalStars >= item.unlock.count;
  if (item.unlock.kind === 'streak') return stats.streak >= item.unlock.days;
  return stats.defeatedBosses.includes(item.unlock.world);
}

export function unlockLabel(item: Item): string | null {
  if (!item.unlock) return null;
  if (item.unlock.kind === 'stars') return `★を${item.unlock.count}個集めると買えるよ`;
  if (item.unlock.kind === 'streak') return `${item.unlock.days}日連続で買えるよ`;
  return `ワールド${item.unlock.world}のボスを倒すと買えるよ`;
}

export function canBuy(
  id: string, coins: number, owned: string[], stats: PlayerStats,
): { ok: true; price: number } | { ok: false; reason: 'unknown' | 'already' | 'locked' | 'poor' } {
  const item = ITEM_BY_ID[id];
  if (!item) return { ok: false, reason: 'unknown' };
  if (isOwned(id, owned)) return { ok: false, reason: 'already' };
  if (!isUnlocked(item, stats)) return { ok: false, reason: 'locked' };
  if (coins < item.price) return { ok: false, reason: 'poor' };
  return { ok: true, price: item.price };
}

export function normalizeEquipped(raw: unknown, owned: string[]): Equipped {
  const out = { ...DEFAULT_EQUIPPED };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const rec = raw as Record<string, unknown>;
  for (const slot of SLOTS) {
    const id = rec[slot];
    if (typeof id !== 'string') continue;
    const item = ITEM_BY_ID[id];
    if (!item || item.slot !== slot) continue;
    if (!isOwned(id, owned)) continue;
    out[slot] = id;
  }
  return out;
}

export function equipItem(equipped: Equipped, id: string, owned: string[]): Equipped | null {
  const item = ITEM_BY_ID[id];
  if (!item || !isOwned(id, owned)) return null;
  return { ...equipped, [item.slot]: id };
}
