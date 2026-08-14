# math-quest 計画2（アバター・ショップ・着せ替え）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 貯まったコインの使い道を作る。ロブロックス風のブロック調SVGアバターを、ショップで買ったパーツで着せ替えできるようにする。

**Architecture:** アイテムカタログはDBに置かずコード（`lib/avatar.ts`）に持つ（問題生成と同じ方針）。DBには「所持アイテムID配列」と「装備状態」だけを player テーブルに追加する。SVGの描画は `components/Avatar.tsx` がカタログの `shape`/`color` を解釈して行い、`lib/` は純粋関数のみでテスト可能に保つ。

**Tech Stack:** Next.js 16 App Router / TypeScript / Vitest / @neondatabase/serverless / Vercel

## Global Constraints

- 新しいライブラリを追加しない（UIライブラリ・アニメーションライブラリ・状態管理ライブラリ禁止）
- 画像素材・外部CDNを使わない。アバターは自前のインラインSVGのみ
- スマホ・タッチ優先UI。ボタンは最小44px
- 文言は小学6年生向け。**学年で習う漢字は普通に使う**（例:「合い言葉」「正解」「復習」「卒業」「準備中」）。ひらがなに開きすぎない。通信エラーは「電波が弱いみたい。もう一度試してね」
- 例外: 算数の表記は教科書に合わせる（「7 あまり 1」「かけ算」「わり算」はそのまま）
- 色は `app/globals.css` のCSS変数を使う（アバターのパーツ色だけはカタログが持つ固有色を使ってよい）
- 既存の規約に合わせる：APIが `!ok` またはthrowしたら `router.replace('/login')`
- 設計書はレア解放条件に「ボス撃破」を挙げているが、ボス戦は次の計画なので、本計画では★合計と連続日数で代用する（解放条件の仕組み自体は後からボス条件を足せる形にしておく）
- コインは減点しない。ショップでの購入だけが唯一のコイン消費
- 本番DBは稼働中。スキーマ変更は `alter table ... add column if not exists` の追加のみ（既存列の変更・削除は禁止）
- 秘密情報は環境変数のみ。コミット禁止
- コミットメッセージは英語で簡潔に、`math-quest:` 接頭辞

---

### Task 1: アイテムカタログと購入・装備ロジック

**Files:**
- Create: `math-quest/lib/avatar.ts`
- Test: `math-quest/tests/avatar.test.ts`

**Interfaces:**
- Produces:
  - `type Slot = 'bg' | 'body' | 'clothes' | 'hair' | 'hat' | 'face'`
  - `type Unlock = { kind: 'stars'; count: number } | { kind: 'streak'; days: number }`
  - `type Item = { id: string; slot: Slot; name: string; price: number; shape?: string; color?: string; unlock?: Unlock }`
  - `type Equipped = Record<Slot, string>`
  - `type PlayerStats = { totalStars: number; streak: number }`
  - `SLOTS: Slot[]`、`SLOT_LABEL: Record<Slot, string>`
  - `ITEMS: Item[]`、`ITEM_BY_ID: Record<string, Item>`
  - `DEFAULT_EQUIPPED: Equipped`
  - `isOwned(id: string, owned: string[]): boolean` — 価格0のアイテムは常に所持扱い
  - `isUnlocked(item: Item, stats: PlayerStats): boolean`
  - `canBuy(id, coins, owned, stats): { ok: true; price: number } | { ok: false; reason: 'unknown' | 'already' | 'locked' | 'poor' }`
  - `unlockLabel(item: Item): string | null` — 「★20こでオープン」等の表示文言
  - `normalizeEquipped(raw: unknown, owned: string[]): Equipped` — DBのjsonbを検証し、未所持・不明・欠損はデフォルトに戻す
  - `equipItem(equipped: Equipped, id: string, owned: string[]): Equipped | null` — 未所持・不明ならnull

- [ ] **Step 1: 失敗するテストを書く**

`math-quest/tests/avatar.test.ts`:

```ts
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
```

- [ ] **Step 2: 失敗を確認**

Run: `cd math-quest && npm test`
Expected: FAIL（`@/lib/avatar` not found）

- [ ] **Step 3: 実装**

`math-quest/lib/avatar.ts`:

```ts
export type Slot = 'bg' | 'body' | 'clothes' | 'hair' | 'hat' | 'face';
export type Unlock = { kind: 'stars'; count: number } | { kind: 'streak'; days: number };
export type Item = {
  id: string; slot: Slot; name: string; price: number;
  shape?: string; color?: string; unlock?: Unlock;
};
export type Equipped = Record<Slot, string>;
export type PlayerStats = { totalStars: number; streak: number };

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
    unlock: { kind: 'streak', days: 14 } },
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
  return item.unlock.kind === 'stars'
    ? stats.totalStars >= item.unlock.count
    : stats.streak >= item.unlock.days;
}

export function unlockLabel(item: Item): string | null {
  if (!item.unlock) return null;
  return item.unlock.kind === 'stars'
    ? `★を${item.unlock.count}個集めると買えるよ`
    : `${item.unlock.days}日連続で買えるよ`;
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
```

- [ ] **Step 4: テスト成功を確認**

Run: `cd math-quest && npm test`
Expected: PASS（既存22件 + 新規7件 = 29件）、警告ゼロ

- [ ] **Step 5: Commit**

```bash
git add math-quest/lib/avatar.ts math-quest/tests/avatar.test.ts
git commit -m "math-quest: add avatar item catalog and purchase/equip logic"
```

---

### Task 2: アバターSVGコンポーネント

**Files:**
- Create: `math-quest/components/Avatar.tsx`
- Create: `math-quest/app/avatar-preview/page.tsx`（確認用の一時ページ。Task 4 で削除する）

**Interfaces:**
- Consumes: `Equipped`, `ITEM_BY_ID`, `DEFAULT_EQUIPPED`, `Slot`（lib/avatar）
- Produces: `<Avatar equipped={Equipped} size?={number} />` — 既定 size=160（幅px。高さは 1.2 倍）。ブロック調のSVGを1つ描く。外部画像・CDNなし

- [ ] **Step 1: Avatarコンポーネントを実装**

`math-quest/components/Avatar.tsx`:

```tsx
import { ITEM_BY_ID, DEFAULT_EQUIPPED, type Equipped, type Slot } from '@/lib/avatar';

const OUTLINE = '#00000022';

function Hair({ shape, color }: { shape?: string; color?: string }) {
  const c = color ?? '#3b2b1a';
  if (shape === 'spiky') return (
    <g fill={c}>
      <polygon points="30,20 38,4 44,20" />
      <polygon points="42,20 50,2 58,20" />
      <polygon points="56,20 62,4 70,20" />
      <rect x="30" y="16" width="40" height="8" />
    </g>
  );
  if (shape === 'long') return (
    <g fill={c}>
      <rect x="28" y="12" width="44" height="16" rx="6" />
      <rect x="26" y="20" width="8" height="40" rx="4" />
      <rect x="66" y="20" width="8" height="40" rx="4" />
    </g>
  );
  if (shape === 'twin') return (
    <g fill={c}>
      <rect x="28" y="12" width="44" height="14" rx="6" />
      <circle cx="24" cy="34" r="9" />
      <circle cx="76" cy="34" r="9" />
    </g>
  );
  return <rect x="28" y="12" width="44" height="14" rx="6" fill={c} />;
}

function Hat({ shape, color }: { shape?: string; color?: string }) {
  const c = color ?? '#ef4444';
  if (shape === 'cap') return (
    <g fill={c}>
      <rect x="28" y="8" width="44" height="12" rx="5" />
      <rect x="28" y="18" width="30" height="5" rx="2" />
    </g>
  );
  if (shape === 'wizard') return (
    <g fill={c}>
      <polygon points="50,-4 34,18 66,18" />
      <rect x="26" y="16" width="48" height="6" rx="3" />
    </g>
  );
  if (shape === 'crown') return (
    <g fill={c}>
      <polygon points="30,18 30,4 40,12 50,2 60,12 70,4 70,18" />
      <rect x="30" y="16" width="40" height="5" />
    </g>
  );
  return null;
}

function Face({ shape }: { shape?: string }) {
  const eye = '#1a1440';
  if (shape === 'cool') return (
    <g fill={eye}>
      <rect x="38" y="32" width="8" height="3" />
      <rect x="54" y="32" width="8" height="3" />
      <rect x="44" y="44" width="12" height="3" rx="1" />
    </g>
  );
  if (shape === 'glasses') return (
    <g>
      <circle cx="42" cy="34" r="6" fill="none" stroke={eye} strokeWidth="2" />
      <circle cx="58" cy="34" r="6" fill="none" stroke={eye} strokeWidth="2" />
      <rect x="48" y="33" width="4" height="2" fill={eye} />
      <path d="M44 44 q6 5 12 0" fill="none" stroke={eye} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
  if (shape === 'star') return (
    <g fill="#ffb703">
      <polygon points="42,28 44,34 50,34 45,38 47,44 42,40 37,44 39,38 34,34 40,34" />
      <polygon points="58,28 60,34 66,34 61,38 63,44 58,40 53,44 55,38 50,34 56,34" />
    </g>
  );
  return (
    <g>
      <circle cx="42" cy="34" r="3.5" fill={eye} />
      <circle cx="58" cy="34" r="3.5" fill={eye} />
      <path d="M43 43 q7 6 14 0" fill="none" stroke={eye} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function Clothes({ shape, color }: { shape?: string; color?: string }) {
  const c = color ?? '#38bdf8';
  if (shape === 'hoodie') return (
    <g fill={c}>
      <rect x="30" y="56" width="40" height="38" rx="4" />
      <rect x="20" y="58" width="12" height="26" rx="4" />
      <rect x="68" y="58" width="12" height="26" rx="4" />
      <rect x="36" y="52" width="28" height="10" rx="5" />
    </g>
  );
  if (shape === 'dress') return (
    <g fill={c}>
      <rect x="32" y="56" width="36" height="20" />
      <polygon points="32,74 68,74 76,98 24,98" />
    </g>
  );
  if (shape === 'armor') return (
    <g fill={c}>
      <rect x="30" y="56" width="40" height="38" rx="4" />
      <rect x="18" y="56" width="14" height="14" rx="5" />
      <rect x="68" y="56" width="14" height="14" rx="5" />
      <rect x="46" y="60" width="8" height="30" fill="#94a3b8" />
    </g>
  );
  return (
    <g fill={c}>
      <rect x="32" y="56" width="36" height="34" rx="3" />
      <rect x="22" y="58" width="12" height="14" rx="3" />
      <rect x="66" y="58" width="12" height="14" rx="3" />
    </g>
  );
}

export default function Avatar({ equipped, size = 160 }: { equipped: Equipped; size?: number }) {
  const pick = (slot: Slot) => ITEM_BY_ID[equipped[slot]] ?? ITEM_BY_ID[DEFAULT_EQUIPPED[slot]];
  const bg = pick('bg'), body = pick('body'), clothes = pick('clothes');
  const hair = pick('hair'), hat = pick('hat'), face = pick('face');
  const skin = body.color ?? '#f5c9a6';

  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2}
      role="img" aria-label="アバター" style={{ display: 'block' }}>
      <rect width="100" height="120" rx="14" fill={bg.color ?? '#1a1440'} />
      {/* あし */}
      <rect x="36" y="90" width="10" height="22" rx="3" fill={skin} />
      <rect x="54" y="90" width="10" height="22" rx="3" fill={skin} />
      {/* うで */}
      <rect x="22" y="58" width="10" height="28" rx="4" fill={skin} />
      <rect x="68" y="58" width="10" height="28" rx="4" fill={skin} />
      {/* どうたい */}
      <rect x="32" y="56" width="36" height="36" rx="4" fill={skin} />
      <Clothes shape={clothes.shape} color={clothes.color} />
      {/* あたま */}
      <rect x="30" y="16" width="40" height="38" rx="6" fill={skin} stroke={OUTLINE} />
      <Face shape={face.shape} />
      <Hair shape={hair.shape} color={hair.color} />
      <Hat shape={hat.shape} color={hat.color} />
    </svg>
  );
}
```

- [ ] **Step 2: 確認用ページを作る**

`math-quest/app/avatar-preview/page.tsx`:

```tsx
import Avatar from '@/components/Avatar';
import { ITEMS, DEFAULT_EQUIPPED, SLOTS, type Equipped } from '@/lib/avatar';

// 全アイテムを1つずつ着せた見え方を並べる確認用ページ（Task 4で削除する）
export default function AvatarPreview() {
  const variants: { label: string; equipped: Equipped }[] = [
    { label: 'きほん', equipped: DEFAULT_EQUIPPED },
    ...ITEMS.filter(i => i.price > 0).map(i => ({
      label: `${i.slot}: ${i.name}`,
      equipped: { ...DEFAULT_EQUIPPED, [i.slot]: i.id } as Equipped,
    })),
  ];
  return (
    <main>
      <h1 style={{ margin: '12px 0' }}>アバター確認（{variants.length}パターン / {SLOTS.length}スロット）</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {variants.map(v => (
          <div key={v.label} className="card" style={{ textAlign: 'center' }}>
            <Avatar equipped={v.equipped} size={120} />
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{v.label}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 型チェックとテスト**

Run: `cd math-quest && npx tsc --noEmit && npm test`
Expected: エラーなし、29件パス

- [ ] **Step 4: ブラウザで見た目を確認**

preview_start で `math-quest` を起動し、モバイル（375×812）で `/avatar-preview` を開く。確認する点：

- 24パターンすべてが崩れずに描画される（頭・体・手足が欠けない、パーツが枠外にはみ出ない）
- 帽子「魔法の帽子」の先端が上に切れていないこと（viewBox上端に注意。切れていたら `polygon points` のy座標を下げて調整してよい）
- 「ワンピース」「よろい」で体が不自然に隠れないこと
- スクリーンショットを1枚撮る
- read_console_messages にエラーがないこと

見た目が明らかにおかしいパーツは、この段階で座標を直す（カタログのidや価格は変えない）。

- [ ] **Step 5: Commit**

```bash
git add math-quest/components/Avatar.tsx math-quest/app/avatar-preview
git commit -m "math-quest: add block-style SVG avatar component"
```

---

### Task 3: DBマイグレーションとショップAPI

**Files:**
- Create: `math-quest/db/migrations/002-avatar.sql`
- Modify: `math-quest/db/schema.sql`（新規構築でも同じ列ができるように追記）
- Modify: `math-quest/app/api/state/route.ts`
- Create: `math-quest/app/api/shop/route.ts`
- Create: `math-quest/app/api/equip/route.ts`

**Interfaces:**
- Consumes: `sql`（lib/db）、`requirePlayer`, `json`（lib/api）、`canBuy`, `equipItem`, `normalizeEquipped`, `ITEM_BY_ID`（lib/avatar）
- Produces:
  - player テーブルに `owned_items text[] not null default '{}'`、`equipped jsonb not null default '{}'::jsonb` を追加
  - `GET /api/state` の返り値に `ownedItems: string[]`、`equipped: Equipped`、`totalStars: number` を追加（既存フィールドは変更しない）
  - `POST /api/shop` body `{ itemId: string }` → 購入。成功 `{ ok: true, coins, ownedItems }`、失敗 `{ ok: false, reason }` を 400 で返す（reason は canBuy と同じ 'unknown' | 'already' | 'locked' | 'poor'）
  - `POST /api/equip` body `{ itemId: string }` → 装備変更。成功 `{ ok: true, equipped }`、未所持・不明は `{ ok: false }` 400
- 注意: 購入は「コインが足りるときだけ引く」を1本のUPDATEで行い、二重タップで二重に引かれないようにする

- [ ] **Step 1: マイグレーションSQLを書く**

`math-quest/db/migrations/002-avatar.sql`:

```sql
-- アバター機能: 所持アイテムと装備状態を player に追加する（既存データは保持）
alter table player add column if not exists owned_items text[] not null default '{}';
alter table player add column if not exists equipped jsonb not null default '{}'::jsonb;
```

`math-quest/db/schema.sql` の player テーブル定義に2行追加（`current_stage` の次の行に挿入）:

```sql
  owned_items text[] not null default '{}',
  equipped jsonb not null default '{}'::jsonb,
```

- [ ] **Step 2: state APIを拡張**

`math-quest/app/api/state/route.ts` を次のように変更する。変更点は (a) select に2列追加、(b) `totalStars` 集計、(c) 返り値に3フィールド追加、の3点のみ:

```ts
import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';
import { todayJST } from '@/lib/streak';
import { normalizeEquipped } from '@/lib/avatar';

export async function GET() {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const [player] = await sql`
    select coins, streak, last_play_date::text, current_stage, owned_items, equipped
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
  });
}
```

- [ ] **Step 3: ショップAPIを実装**

`math-quest/app/api/shop/route.ts`:

```ts
import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';
import { canBuy } from '@/lib/avatar';

export async function POST(req: Request) {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const { itemId } = await req.json().catch(() => ({}));
  if (typeof itemId !== 'string') return json({ ok: false, reason: 'unknown' }, 400);

  const [player] = await sql`
    select coins, streak, owned_items from player where id = ${pid}`;
  if (!player) return json({ ok: false }, 401);
  const [starRow] = await sql`
    select coalesce(sum(stars), 0)::int as total from progress where player_id = ${pid}`;

  const owned: string[] = player.owned_items ?? [];
  const check = canBuy(itemId, player.coins, owned, {
    totalStars: starRow.total, streak: player.streak,
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
```

- [ ] **Step 4: 装備APIを実装**

`math-quest/app/api/equip/route.ts`:

```ts
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
```

- [ ] **Step 5: ローカルDBにマイグレーションを当てて型チェック**

ローカル検証環境（Task 12レポート `.superpowers/sdd/task-12-report.md` 参照）のコンテナを起動:

```bash
docker start mathquest-pg mathquest-proxy
docker exec -i mathquest-pg psql -U mathquest -d mathquest < math-quest/db/migrations/002-avatar.sql
docker exec mathquest-pg psql -U mathquest -d mathquest -c "\d player"
```

Expected: `owned_items` と `equipped` が列一覧に出る

Run: `cd math-quest && npx tsc --noEmit && npm test`
Expected: エラーなし、29件パス

- [ ] **Step 6: Commit**

```bash
git add math-quest/db math-quest/app/api
git commit -m "math-quest: add avatar columns, shop and equip APIs"
```

---

### Task 4: ショップ・着せ替え画面とホーム統合

**Files:**
- Create: `math-quest/app/shop/page.tsx`
- Modify: `math-quest/app/page.tsx`
- Delete: `math-quest/app/avatar-preview/page.tsx`

**Interfaces:**
- Consumes: `GET /api/state`, `POST /api/shop`, `POST /api/equip`、`<Avatar />`、`ITEMS`, `SLOTS`, `SLOT_LABEL`, `isOwned`, `isUnlocked`, `unlockLabel`, `ITEM_BY_ID`, `type Equipped`
- Produces: `/shop` 画面（上部に現在のアバターとコイン、下にスロット別のアイテム一覧）。ホームに実アバター表示と「ショップ・着せかえ」ボタン
- 挙動:
  - 所持済みアイテム → タップで即装備（`/api/equip`）。装備中はふちが `--accent` で光る
  - 未所持・解放済み → 「◯◯コインで かう」ボタン。押すと購入し、成功したらそのまま装備する
  - 未解放 → グレー表示＋`unlockLabel` の条件文。押せない
  - コイン不足 → ボタンは押せるが、押すと「コインが たりないよ」を表示（がっかりさせないよう、あと何コインか出す）

- [ ] **Step 1: ショップ画面を実装**

`math-quest/app/shop/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import {
  ITEMS, ITEM_BY_ID, SLOTS, SLOT_LABEL, isOwned, isUnlocked, unlockLabel,
  DEFAULT_EQUIPPED, type Equipped, type Slot,
} from '@/lib/avatar';

type State = {
  ok: boolean; coins: number; streak: number; totalStars: number;
  ownedItems: string[]; equipped: Equipped;
};

export default function ShopPage() {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/state').then(r => r.json()).then(d => {
      if (!d.ok) { router.replace('/login'); return; }
      setState(d);
    }).catch(() => router.replace('/login'));
  }, [router]);

  if (!state) return <main><p>準備中…</p></main>;

  const stats = { totalStars: state.totalStars, streak: state.streak };

  // setState は必ず関数形で更新する。buy の直後に doEquip を呼ぶため、
  // 古い state を展開すると購入で減ったコインを巻き戻してしまう
  const doEquip = async (itemId: string) => {
    const r = await fetch('/api/equip', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId }),
    });
    const d = await r.json();
    if (d.ok) setState(s => (s ? { ...s, equipped: d.equipped } : s));
  };

  const equip = async (itemId: string) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      await doEquip(itemId);
    } catch {
      setMessage('でんぱがよわいみたい。もういちどためしてね');
    } finally { setBusy(false); }
  };

  const buy = async (itemId: string) => {
    if (busy) return;
    const item = ITEM_BY_ID[itemId];
    if (state.coins < item.price) {
      setMessage(`コインが足りないよ（あと${item.price - state.coins}枚）`);
      return;
    }
    setBusy(true); setMessage('');
    try {
      const r = await fetch('/api/shop', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const d = await r.json();
      if (!d.ok) {
        setMessage(d.reason === 'poor' ? 'コインが足りないよ' : '今は買えないみたい');
        return;
      }
      setState(s => (s ? { ...s, coins: d.coins, ownedItems: d.ownedItems } : s));
      setMessage(`${item.name} を手に入れた！`);
      await doEquip(itemId);
    } catch {
      setMessage('でんぱがよわいみたい。もういちどためしてね');
    } finally { setBusy(false); }
  };

  return (
    <main>
      <Link href="/" style={{ color: 'var(--muted)' }}>← ホーム</Link>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0' }}>
        <Avatar equipped={state.equipped} size={110} />
        <div>
          <div style={{ fontSize: '1.3rem' }}>🪙 {state.coins}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>★合計 {state.totalStars}個</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>🔥 {state.streak}日連続</div>
        </div>
      </div>

      {message && (
        <p className="card" style={{ textAlign: 'center', color: 'var(--accent)', marginBottom: 12 }}>
          {message}
        </p>
      )}

      {SLOTS.map((slot: Slot) => (
        <section key={slot} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: 8 }}>
            {SLOT_LABEL[slot]}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {ITEMS.filter(i => i.slot === slot).map(item => {
              const owned = isOwned(item.id, state.ownedItems);
              const unlocked = isUnlocked(item, stats);
              const wearing = state.equipped[slot] === item.id;
              return (
                <div key={item.id} className="card"
                  style={{
                    opacity: unlocked ? 1 : 0.45,
                    outline: wearing ? '3px solid var(--accent)' : 'none',
                  }}>
                  <Avatar equipped={{ ...DEFAULT_EQUIPPED, [slot]: item.id } as Equipped} size={72} />
                  <div style={{ fontSize: '0.9rem', margin: '6px 0' }}>{item.name}</div>
                  {!unlocked && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      🔒 {unlockLabel(item)}
                    </div>
                  )}
                  {unlocked && owned && (
                    <button className="btn-primary" disabled={wearing || busy}
                      onClick={() => equip(item.id)}
                      style={{
                        minHeight: 44, fontSize: '0.95rem', width: '100%',
                        background: wearing ? 'var(--card)' : 'var(--good)',
                        color: wearing ? 'var(--muted)' : '#1a1440',
                      }}>
                      {wearing ? '着てるよ' : '着がえる'}
                    </button>
                  )}
                  {unlocked && !owned && (
                    <button className="btn-primary" disabled={busy}
                      onClick={() => buy(item.id)}
                      style={{ minHeight: 44, fontSize: '0.95rem', width: '100%' }}>
                      🪙{item.price} で買う
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 2: ホームにアバターとショップ導線を入れる**

`math-quest/app/page.tsx` を次の2点だけ変更する。

(a) import に追加:

```tsx
import Avatar from '@/components/Avatar';
import { DEFAULT_EQUIPPED, type Equipped } from '@/lib/avatar';
```

(b) `type State` に `equipped` を追加:

```tsx
type State = {
  ok: boolean; coins: number; streak: number; currentStage: string;
  missionDoneToday: boolean; reviewProblems: unknown[]; equipped?: Equipped;
};
```

(c) 🐣 のプレースホルダーカードを実アバターに差し替える:

```tsx
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Avatar equipped={state.equipped ?? DEFAULT_EQUIPPED} size={150} />
        </div>
      </div>
```

(d) 「まちがいノート」ボタンの下にショップ導線を追加:

```tsx
      <Link href="/shop">
        <button className="btn-primary" style={{ background: 'var(--card)', color: 'var(--text)' }}>
          ショップ・着せかえ
        </button>
      </Link>
```

- [ ] **Step 3: クイズ中にもアバターを出す**

設計書の「アバターはミッション中も画面のすみで応援してくれる」に対応する。3ファイルを最小限だけ変更する。

(a) `math-quest/app/quiz/[stageId]/page.tsx` の `type State` に `equipped` を追加:

```tsx
type State = {
  currentStage: string;
  reviewProblems: { id: number; problem: Problem }[];
  equipped?: Equipped;
};
```

import も追加する:

```tsx
import { DEFAULT_EQUIPPED, type Equipped } from '@/lib/avatar';
```

`/api/state` 失敗時のフォールバックにも equipped を入れる:

```tsx
    }).catch(() => setState({ currentStage: 'w1-1', reviewProblems: [], equipped: DEFAULT_EQUIPPED }));
```

(b) `<QuizRunner ... />` に equipped を渡す:

```tsx
        <QuizRunner stageId={realStage} equipped={state.equipped ?? DEFAULT_EQUIPPED}
          reviews={isMission ? state.reviewProblems : []} onFinish={finish} />
```

(c) `math-quest/components/QuizRunner.tsx` — propsに `equipped` を足し、進捗行の左端に小さくアバターを出す:

```tsx
import Avatar from './Avatar';
import type { Equipped } from '@/lib/avatar';
```

```tsx
export default function QuizRunner({ stageId, reviews, equipped, onFinish }: {
  stageId: string;
  reviews: { id: number; problem: Problem }[];
  equipped: Equipped;
  onFinish: (r: { correctCount: number; total: number }) => void;
}) {
```

進捗行を次のように置き換える（アバターを左端に追加するだけ。既存の表示要素は消さない）:

```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--muted)' }}>
        <Avatar equipped={equipped} size={32} />
        <span>{i + 1} / {items.length} もんめ</span>
        {combo >= 2 && <span style={{ color: 'var(--accent)' }}>🔥 {combo} コンボ</span>}
        {item.isReview && <span>ふくしゅう</span>}
      </div>
```

- [ ] **Step 4: 確認用ページを削除**

```bash
rm -rf math-quest/app/avatar-preview
```

- [ ] **Step 5: 型チェックとテスト**

Run: `cd math-quest && npx tsc --noEmit && npm test`
Expected: エラーなし、29件パス

- [ ] **Step 6: ローカルで通し確認**

ローカルDB（Docker）とpreviewを起動し、モバイル（375×812）で確認する。事前に手持ちコインを増やしておく:

```bash
docker exec mathquest-pg psql -U mathquest -d mathquest -c "update player set coins = 2000;"
```

確認する流れ：
1. ホームにアバターが表示され、「ショップ・着せかえ」でショップに行ける
2. 「キャップ」を買う → コインが90減り、そのまま装備されてアバターに反映される
3. 別の髪型に「着がえる」→ 即座にアバターが変わる。装備中は「着てるよ」になり押せない
4. 未解放アイテム（宇宙・よろい・スターアイ・スライム・王冠）が 🔒 と条件文つきでグレー表示される
5. コインを減らして不足時の文言を確認: `update player set coins = 10;` → 買おうとすると「コインが足りないよ（あと◯枚）」
6. ホームに戻ってもアバターが保持されている（DBに保存されている）
7. `docker exec mathquest-pg psql -U mathquest -d mathquest -c "select coins, owned_items, equipped from player;"` で行の中身を確認
8. `/quiz/w1-1` を開き、進捗行の左に小さいアバターが出て、レイアウトが崩れていないこと
9. read_console_messages にエラーがないこと。スクリーンショットを撮る

- [ ] **Step 7: Commit**

```bash
git add math-quest/app math-quest/components
git commit -m "math-quest: add shop and dress-up screen, show avatar on home and quiz"
```

---

### Task 5: 本番反映

**Files:** なし（マイグレーション適用とデプロイのみ）

**Interfaces:**
- Consumes: Task 1〜4 の成果物
- Produces: 本番 https://math-quest-lemon-five.vercel.app にアバター機能が反映された状態

- [ ] **Step 1: 本番DBにマイグレーションを当てる**

`math-quest/` で作業する。本番の接続文字列を一時ファイルに取り出し、Nodeスクリプトで適用して、後始末する。**接続文字列を標準出力に出さないこと。**

```bash
cd math-quest
TMP=$(mktemp)
npx vercel env pull "$TMP" --environment=production --yes >/dev/null
cat > ./tmp-migrate.mjs <<'EOF'
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
const url = fs.readFileSync(process.argv[2],'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g,'');
const sql = neon(url);
const stmts = fs.readFileSync('db/migrations/002-avatar.sql','utf8')
  .split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'));
for (const s of stmts) { await sql.query(s); console.log('OK:', s.slice(0, 60)); }
const cols = await sql`select column_name from information_schema.columns
  where table_name = 'player' order by column_name`;
console.log('player columns:', cols.map(c => c.column_name).join(', '));
EOF
node ./tmp-migrate.mjs "$TMP"
rm -f ./tmp-migrate.mjs "$TMP"
```

Expected: `owned_items` と `equipped` が列一覧に含まれる

- [ ] **Step 2: 本番デプロイ**

```bash
cd math-quest && npx vercel deploy --prod
```

- [ ] **Step 3: 本番で確認**

ブラウザで https://math-quest-lemon-five.vercel.app を開く（モバイルサイズ）。

**重要: 本番のプレイヤーデータはお子さんのものなので、コインを書き換えたり購入したりしない。** 確認するのは次だけ:

- `/login` が今までどおり表示される
- ログイン済みならホームにアバターが表示され、`/shop` が開いてアイテム一覧が並ぶ（未購入のまま眺めるだけ）
- read_console_messages にエラーがないこと
- スクリーンショットを1枚撮る

まだ誰もログインしていない場合は、`/login` が表示され `/shop` が `/login` にリダイレクトされることだけ確認する（それが正しい挙動）。

- [ ] **Step 4: Commit と push**

```bash
git push origin math-quest-core
```

---

## この計画に含めないもの（次の計画）

- モンスターHP・ボス戦などのバトル演出
- タイムアタック（60秒・自己ベスト）
- 保護者ページ（正答率推移・苦手分野ランキング）
- オフライン時の解答キュー
- 難易度の自動調整
