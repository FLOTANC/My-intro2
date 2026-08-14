import { expect, test } from 'vitest';
import {
  ITEMS, ITEM_BY_ID, SLOTS, DEFAULT_EQUIPPED,
  isOwned, isUnlocked, canBuy, unlockLabel, normalizeEquipped, equipItem,
} from '@/lib/avatar';

test('カタログの整合性: idが一意で、全スロットに無料の初期アイテムがある', () => {
  expect(new Set(ITEMS.map(i => i.id)).size).toBe(ITEMS.length);
  for (const slot of SLOTS) {
    const free = ITEMS.filter(i => i.slot === slot && i.price === 0);
    expect(free.length).toBeGreaterThanOrEqual(1);
  }
  for (const slot of SLOTS) {
    const def = ITEM_BY_ID[DEFAULT_EQUIPPED[slot]];
    expect(def).toBeDefined();
    expect(def.slot).toBe(slot);
    expect(def.price).toBe(0);
  }
  for (const i of ITEMS) expect(i.name.length).toBeGreaterThan(0);
});

test('isOwned: 無料アイテムは常に所持あつかい', () => {
  expect(isOwned('hat-none', [])).toBe(true);
  expect(isOwned('hat-cap', [])).toBe(false);
  expect(isOwned('hat-cap', ['hat-cap'])).toBe(true);
});

test('isUnlocked: 条件つきアイテムは条件を満たすまでロック', () => {
  const locked = ITEMS.find(i => i.unlock?.kind === 'stars')!;
  const need = (locked.unlock as { kind: 'stars'; count: number }).count;
  expect(isUnlocked(locked, { totalStars: need - 1, streak: 0 })).toBe(false);
  expect(isUnlocked(locked, { totalStars: need, streak: 0 })).toBe(true);
  const free = ITEM_BY_ID[DEFAULT_EQUIPPED.hat];
  expect(isUnlocked(free, { totalStars: 0, streak: 0 })).toBe(true);
});

test('canBuy: 不明・所持済み・ロック中・コイン不足をそれぞれ弾く', () => {
  const stats = { totalStars: 999, streak: 999 };
  expect(canBuy('nope', 999, [], stats)).toEqual({ ok: false, reason: 'unknown' });
  expect(canBuy('hat-cap', 999, ['hat-cap'], stats)).toEqual({ ok: false, reason: 'already' });
  const cap = ITEM_BY_ID['hat-cap'];
  expect(canBuy('hat-cap', cap.price - 1, [], stats)).toEqual({ ok: false, reason: 'poor' });
  expect(canBuy('hat-cap', cap.price, [], stats)).toEqual({ ok: true, price: cap.price });
  const locked = ITEMS.find(i => i.unlock)!;
  expect(canBuy(locked.id, 99999, [], { totalStars: 0, streak: 0 }))
    .toEqual({ ok: false, reason: 'locked' });
});

test('unlockLabel: 条件つきだけ文言を返す', () => {
  expect(unlockLabel(ITEM_BY_ID['hat-cap'])).toBeNull();
  const locked = ITEMS.find(i => i.unlock)!;
  expect(unlockLabel(locked)).toBeTruthy();
});

test('normalizeEquipped: こわれた値・未所持はデフォルトに戻す', () => {
  expect(normalizeEquipped(null, [])).toEqual(DEFAULT_EQUIPPED);
  expect(normalizeEquipped('こわれた', [])).toEqual(DEFAULT_EQUIPPED);
  expect(normalizeEquipped({ hat: 'nope' }, [])).toEqual(DEFAULT_EQUIPPED);
  // 未所持のものを装備した状態がDBにあってもデフォルトに戻す
  expect(normalizeEquipped({ hat: 'hat-cap' }, [])).toEqual(DEFAULT_EQUIPPED);
  // 所持していれば残る
  expect(normalizeEquipped({ hat: 'hat-cap' }, ['hat-cap']).hat).toBe('hat-cap');
  // スロット違いのidは無視
  expect(normalizeEquipped({ hat: 'hair-spiky' }, ['hair-spiky']).hat).toBe(DEFAULT_EQUIPPED.hat);
});

test('equipItem: 所持していれば差し替え、していなければnull', () => {
  expect(equipItem(DEFAULT_EQUIPPED, 'hat-cap', [])).toBeNull();
  expect(equipItem(DEFAULT_EQUIPPED, 'nope', ['nope'])).toBeNull();
  const next = equipItem(DEFAULT_EQUIPPED, 'hat-cap', ['hat-cap']);
  expect(next!.hat).toBe('hat-cap');
  expect(next!.hair).toBe(DEFAULT_EQUIPPED.hair); // 他スロットは変わらない
  expect(DEFAULT_EQUIPPED.hat).not.toBe('hat-cap'); // 元を書き換えない
});
