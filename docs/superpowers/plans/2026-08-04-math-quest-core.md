# math-quest 計画1（学習コア）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小6向け かけ算・わり算練習アプリの学習コア（問題生成→クイズ→ミッション→まちがいノート→サーバー保存→Vercelデプロイ）を動く状態にする。

**Architecture:** `math-quest/` に Next.js (App Router, TypeScript) を新規作成。問題はDBに置かずクライアントで自動生成（純粋関数群 `lib/`、Vitestでテスト）。Neon Postgres に family/player/progress/mistakes を保存し、合い言葉ログインは HMAC署名 httpOnly cookie。ゲーム演出（アバター・バトル・タイムアタック・保護者ページ）は計画2。

**Tech Stack:** Next.js (App Router) / TypeScript / Vitest / @neondatabase/serverless / Vercel

## Global Constraints

- 新しい重量級ライブラリを追加しない（UIライブラリ・ORM・状態管理ライブラリ禁止。許可: `@neondatabase/serverless`, `vitest`）
- 画像・キャラはSVG自前描画（外部CDN・画像素材なし）
- スマホ・タッチ優先UI（回答は画面内テンキー、ボタンは最小44px）
- 不正解でコイン減少などのペナルティを与えない
- 子ども向け文言はやさしい日本語（ひらがな多め）。エラー例:「でんぱがよわいみたい。もういちどためしてね」
- 秘密情報（`DATABASE_URL`, `SESSION_SECRET`）は環境変数のみ。コミット禁止
- コミットメッセージは英語で簡潔に（リポジトリ規約）
- 日付・ストリーク計算はすべて Asia/Tokyo 基準

---

### Task 1: プロジェクト scaffold + Vitest

**Files:**
- Create: `math-quest/`（create-next-app 生成物一式）
- Create: `math-quest/vitest.config.ts`
- Modify: `math-quest/package.json`（test スクリプト追加）

**Interfaces:**
- Produces: 以降の全タスクの土台。`npm test` で Vitest が走る。パスエイリアス `@/` → `math-quest/` 直下

- [ ] **Step 1: Next.js アプリ生成**

```bash
cd /Users/fujitatakako/デスクトップ/claude
npx create-next-app@latest math-quest --ts --app --no-tailwind --no-eslint --src-dir=false --import-alias "@/*" --use-npm --skip-install=false
```

対話プロンプトが出たら: Tailwind=No, ESLint=No, src dir=No, Turbopack=Yes。

- [ ] **Step 2: Vitest 導入**

```bash
cd math-quest && npm i -D vitest
```

`math-quest/vitest.config.mts`（ESMロードでCJS非推奨警告を避けるため .mts）:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: { include: ['tests/**/*.test.ts'] },
});
```

`package.json` の scripts に追加: `"test": "vitest run"`

- [ ] **Step 3: 動作確認**

`math-quest/tests/smoke.test.ts`:

```ts
import { expect, test } from 'vitest';
test('smoke', () => expect(1 + 1).toBe(2));
```

Run: `npm test` → Expected: 1 passed。確認後 `tests/smoke.test.ts` は削除。

- [ ] **Step 4: Commit**

```bash
git add math-quest && git commit -m "math-quest: scaffold Next.js app with Vitest"
```

---

### Task 2: 型定義とステージカタログ

**Files:**
- Create: `math-quest/lib/types.ts`
- Create: `math-quest/lib/stages.ts`
- Test: `math-quest/tests/stages.test.ts`

**Interfaces:**
- Produces:
  - `Problem`（判別共用体。mistakes テーブルにそのままJSON保存する形）
  - `Fraction = { n: number; d: number }`
  - `StageDef = { id: string; world: number; title: string }`
  - `WORLDS: { id: number; title: string }[]`（6ワールド）
  - `STAGES: StageDef[]`（全31ステージ、配列順=解放順）
  - `stageById(id: string): StageDef | undefined`
  - `nextStageId(id: string): string | null`

- [ ] **Step 1: 型定義を書く**

`math-quest/lib/types.ts`:

```ts
export type Fraction = { n: number; d: number };

export type Problem =
  | { kind: 'mul'; a: number; b: number; answer: number }
  | { kind: 'div'; a: number; b: number; answer: number }
  | { kind: 'divmod'; a: number; b: number; q: number; r: number }
  | { kind: 'dec-mul'; a: string; b: string; answer: string }
  | { kind: 'dec-div'; a: string; b: string; answer: string }
  | { kind: 'frac-mul'; a: Fraction; b: Fraction; answer: Fraction }
  | { kind: 'frac-div'; a: Fraction; b: Fraction; answer: Fraction };

export type AnswerInput = {
  value?: string; // mul/div/dec-* 用
  q?: string; r?: string; // divmod 用（商・あまり）
  n?: string; d?: string; // frac-* 用（分子・分母）
};
```

- [ ] **Step 2: 失敗するテストを書く**

`math-quest/tests/stages.test.ts`:

```ts
import { expect, test } from 'vitest';
import { STAGES, WORLDS, stageById, nextStageId } from '@/lib/stages';

test('6 worlds, 31 stages, unique ids', () => {
  expect(WORLDS).toHaveLength(6);
  expect(STAGES).toHaveLength(31);
  expect(new Set(STAGES.map(s => s.id)).size).toBe(31);
});

test('every world has at least 5 stages in ascending world order', () => {
  for (let w = 1; w <= 6; w++)
    expect(STAGES.filter(s => s.world === w).length).toBeGreaterThanOrEqual(5);
  const worlds = STAGES.map(s => s.world);
  expect([...worlds].sort((a, b) => a - b)).toEqual(worlds);
});

test('stageById / nextStageId', () => {
  expect(stageById('w1-1')?.world).toBe(1);
  expect(nextStageId('w1-1')).toBe('w1-2');
  expect(nextStageId(STAGES[STAGES.length - 1].id)).toBeNull();
});
```

- [ ] **Step 3: 失敗を確認**

Run: `npm test` → Expected: FAIL（`@/lib/stages` not found）

- [ ] **Step 4: 実装**

`math-quest/lib/stages.ts`:

```ts
export type StageDef = { id: string; world: number; title: string };

export const WORLDS = [
  { id: 1, title: '九九の島' },
  { id: 2, title: 'わり算の森' },
  { id: 3, title: '筆算の山' },
  { id: 4, title: '筆算の谷' },
  { id: 5, title: '小数の海' },
  { id: 6, title: '分数の城' },
];

const defs: [string, number, string][] = [
  ['w1-1', 1, '2・3のだん'], ['w1-2', 1, '4・5のだん'], ['w1-3', 1, '6・7のだん'],
  ['w1-4', 1, '8・9のだん'], ['w1-5', 1, '九九ミックス'], ['w1-6', 1, '九九マスター'],
  ['w2-1', 2, '九九のぎゃく算'], ['w2-2', 2, 'わり算きほん'], ['w2-3', 2, 'あまりのあるわり算'],
  ['w2-4', 2, 'あまり チャレンジ'], ['w2-5', 2, 'わり算ミックス'],
  ['w3-1', 3, '2けた×1けた'], ['w3-2', 3, '3けた×1けた'], ['w3-3', 3, '2けた×2けた'],
  ['w3-4', 3, '3けた×2けた'], ['w3-5', 3, 'かけ算筆算ミックス'],
  ['w4-1', 4, '2けた÷1けた'], ['w4-2', 4, '3けた÷1けた'], ['w4-3', 4, 'あまりつき筆算'],
  ['w4-4', 4, '3けた÷2けた'], ['w4-5', 4, 'わり算筆算ミックス'],
  ['w5-1', 5, '小数×整数'], ['w5-2', 5, '小数×小数'], ['w5-3', 5, '小数÷整数'],
  ['w5-4', 5, '小数÷小数'], ['w5-5', 5, '小数ミックス'],
  ['w6-1', 6, '分数×整数'], ['w6-2', 6, '分数×分数'], ['w6-3', 6, '分数÷分数'],
  ['w6-4', 6, '約分チャレンジ'], ['w6-5', 6, '分数ミックス'],
];

export const STAGES: StageDef[] = defs.map(([id, world, title]) => ({ id, world, title }));

export function stageById(id: string): StageDef | undefined {
  return STAGES.find(s => s.id === id);
}

export function nextStageId(id: string): string | null {
  const i = STAGES.findIndex(s => s.id === id);
  if (i < 0 || i === STAGES.length - 1) return null;
  return STAGES[i + 1].id;
}
```

- [ ] **Step 5: テスト成功を確認**

Run: `npm test` → Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add math-quest/lib math-quest/tests && git commit -m "math-quest: add problem types and stage catalog"
```

---

### Task 3: 問題ジェネレーター

**Files:**
- Create: `math-quest/lib/problems.ts`
- Test: `math-quest/tests/problems.test.ts`

**Interfaces:**
- Consumes: `Problem`, `Fraction`（lib/types）、`STAGES` の id 一覧
- Produces:
  - `generateProblem(stageId: string): Problem` — ステージに応じた問題を1問生成
  - `formatScaled(int: number, scale: number): string` — 整数×10^-scale を文字列化（末尾0除去）
  - `reduceFrac(f: Fraction): Fraction`
- 設計方針: 小数は「スケール付き整数」で厳密計算（浮動小数点の誤差を出さない）。分数は必ず約分して answer に格納。

- [ ] **Step 1: 失敗するテストを書く**

`math-quest/tests/problems.test.ts`:

```ts
import { expect, test } from 'vitest';
import { generateProblem, formatScaled, reduceFrac } from '@/lib/problems';
import { STAGES } from '@/lib/stages';

const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);

test('formatScaled', () => {
  expect(formatScaled(120, 2)).toBe('1.2');
  expect(formatScaled(1035, 0)).toBe('1035');
  expect(formatScaled(5, 2)).toBe('0.05');
  expect(formatScaled(3000, 3)).toBe('3');
});

test('reduceFrac', () => {
  expect(reduceFrac({ n: 6, d: 8 })).toEqual({ n: 3, d: 4 });
  expect(reduceFrac({ n: 10, d: 5 })).toEqual({ n: 2, d: 1 });
});

test('every stage generates valid problems (100 samples each)', () => {
  for (const s of STAGES) {
    for (let i = 0; i < 100; i++) {
      const p = generateProblem(s.id);
      if (p.kind === 'mul') expect(p.a * p.b).toBe(p.answer);
      if (p.kind === 'div') { expect(p.a % p.b).toBe(0); expect(p.a / p.b).toBe(p.answer); }
      if (p.kind === 'divmod') {
        expect(p.b * p.q + p.r).toBe(p.a);
        expect(p.r).toBeGreaterThan(0); expect(p.r).toBeLessThan(p.b);
      }
      if (p.kind === 'dec-mul' || p.kind === 'dec-div')
        expect(Number(p.a) * (p.kind === 'dec-mul' ? Number(p.b) : 1 / Number(p.b)))
          .toBeCloseTo(Number(p.answer), 6);
      if (p.kind === 'frac-mul' || p.kind === 'frac-div') {
        expect(p.answer.d).toBeGreaterThan(0);
        expect(gcd(p.answer.n, p.answer.d)).toBe(1); // 約分済み
      }
    }
  }
});

test('unknown stage throws', () => {
  expect(() => generateProblem('nope')).toThrow();
});

test('w4 dividends stay within advertised digit counts', () => {
  for (let i = 0; i < 200; i++) {
    const p1 = generateProblem('w4-1');
    if (p1.kind === 'div') { expect(p1.a).toBeGreaterThanOrEqual(10); expect(p1.a).toBeLessThanOrEqual(99); }
    const p2 = generateProblem('w4-2');
    if (p2.kind === 'div') { expect(p2.a).toBeGreaterThanOrEqual(100); expect(p2.a).toBeLessThanOrEqual(999); }
    const p4 = generateProblem('w4-4');
    if (p4.kind === 'div') { expect(p4.a).toBeGreaterThanOrEqual(100); expect(p4.a).toBeLessThanOrEqual(999); }
  }
});

test('kuku stages stay within their dan', () => {
  for (let i = 0; i < 50; i++) {
    const p = generateProblem('w1-1');
    if (p.kind !== 'mul') throw new Error('expected mul');
    expect([2, 3]).toContain(p.a);
    expect(p.b).toBeGreaterThanOrEqual(2); expect(p.b).toBeLessThanOrEqual(9);
  }
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npm test` → Expected: FAIL（`@/lib/problems` not found）

- [ ] **Step 3: 実装**

`math-quest/lib/problems.ts`:

```ts
import type { Problem, Fraction } from './types';

const ri = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function reduceFrac(f: Fraction): Fraction {
  const g = gcd(f.n, f.d);
  return { n: f.n / g, d: f.d / g };
}

export function formatScaled(int: number, scale: number): string {
  let s = String(int).padStart(scale + 1, '0');
  if (scale === 0) return s;
  s = s.slice(0, -scale) + '.' + s.slice(-scale);
  return s.replace(/\.?0+$/, '');
}

const mul = (aLo: number, aHi: number, bLo: number, bHi: number): Problem => {
  const a = ri(aLo, aHi), b = ri(bLo, bHi);
  return { kind: 'mul', a, b, answer: a * b };
};
const kuku = (dans: number[]): Problem => {
  const a = pick(dans), b = ri(2, 9);
  return { kind: 'mul', a, b, answer: a * b };
};
const divExact = (bLo: number, bHi: number, qLo: number, qHi: number): Problem => {
  const b = ri(bLo, bHi), q = ri(qLo, qHi);
  return { kind: 'div', a: b * q, b, answer: q };
};
const divmod = (bLo: number, bHi: number, qLo: number, qHi: number): Problem => {
  const b = ri(Math.max(bLo, 2), bHi), q = ri(qLo, qHi), r = ri(1, b - 1);
  return { kind: 'divmod', a: b * q + r, b, q, r };
};
// 割られる数の桁数を保証する割り算（qをa範囲から逆算）
const divByDividend = (bLo: number, bHi: number, aLo: number, aHi: number): Problem => {
  const b = ri(bLo, bHi);
  const q = ri(Math.ceil(aLo / b), Math.floor(aHi / b));
  return { kind: 'div', a: b * q, b, answer: q };
};
// 小数: (ai, sa) は ai×10^-sa。積は厳密。
const decMul = (aDigits: number, sa: number, bDigits: number, sb: number): Problem => {
  const ai = ri(10 ** (aDigits - 1) + 1, 10 ** aDigits - 1);
  const bi = ri(10 ** (bDigits - 1) + 1, 10 ** bDigits - 1);
  return {
    kind: 'dec-mul',
    a: formatScaled(ai, sa), b: formatScaled(bi, sb),
    answer: formatScaled(ai * bi, sa + sb),
  };
};
// 商を先に決めて割られる数を作る（必ず割り切れる）
const decDiv = (qDigits: number, sq: number, bDigits: number, sb: number): Problem => {
  const qi = ri(10 ** (qDigits - 1) + 1, 10 ** qDigits - 1);
  const bi = ri(10 ** (bDigits - 1) + 1, 10 ** bDigits - 1);
  return {
    kind: 'dec-div',
    a: formatScaled(qi * bi, sq + sb), b: formatScaled(bi, sb),
    answer: formatScaled(qi, sq),
  };
};
const frac = (): Fraction => ({ n: ri(1, 9), d: ri(2, 9) });
const fracMulInt = (): Problem => {
  const a = frac(), k = ri(2, 9);
  return { kind: 'frac-mul', a, b: { n: k, d: 1 }, answer: reduceFrac({ n: a.n * k, d: a.d }) };
};
const fracMul = (): Problem => {
  const a = frac(), b = frac();
  return { kind: 'frac-mul', a, b, answer: reduceFrac({ n: a.n * b.n, d: a.d * b.d }) };
};
const fracDiv = (): Problem => {
  const a = frac(), b = frac();
  return { kind: 'frac-div', a, b, answer: reduceFrac({ n: a.n * b.d, d: a.d * b.n }) };
};
// 約分が必ず起きる問題（分子分母に共通因数を仕込む）
const fracReducible = (): Problem => {
  const k = ri(2, 4), a = { n: ri(1, 4) * k, d: ri(2, 4) * k };
  const b = frac();
  return { kind: 'frac-mul', a, b, answer: reduceFrac({ n: a.n * b.n, d: a.d * b.d }) };
};

const gens: Record<string, () => Problem> = {
  'w1-1': () => kuku([2, 3]), 'w1-2': () => kuku([4, 5]), 'w1-3': () => kuku([6, 7]),
  'w1-4': () => kuku([8, 9]), 'w1-5': () => kuku([2, 3, 4, 5, 6, 7, 8, 9]),
  'w1-6': () => kuku([6, 7, 8, 9]),
  'w2-1': () => divExact(2, 9, 2, 9), 'w2-2': () => divExact(2, 9, 2, 9),
  'w2-3': () => divmod(2, 9, 2, 9), 'w2-4': () => divmod(3, 9, 5, 9),
  'w2-5': () => pick([() => divExact(2, 9, 2, 9), () => divmod(2, 9, 2, 9)])(),
  'w3-1': () => mul(11, 99, 2, 9), 'w3-2': () => mul(101, 999, 2, 9),
  'w3-3': () => mul(11, 99, 11, 99), 'w3-4': () => mul(101, 999, 11, 99),
  'w3-5': () => pick([() => mul(11, 99, 2, 9), () => mul(11, 99, 11, 99), () => mul(101, 999, 11, 99)])(),
  'w4-1': () => divByDividend(2, 9, 10, 99), 'w4-2': () => divByDividend(2, 9, 100, 999),
  'w4-3': () => divmod(3, 9, 11, 99), 'w4-4': () => divByDividend(11, 19, 100, 999),
  'w4-5': () => pick([() => divByDividend(2, 9, 10, 99), () => divmod(3, 9, 11, 99), () => divByDividend(11, 19, 100, 999)])(),
  'w5-1': () => decMul(2, 1, 1, 0), 'w5-2': () => decMul(2, 1, 1, 1),
  'w5-3': () => decDiv(2, 1, 1, 0), 'w5-4': () => decDiv(1, 1, 1, 1),
  'w5-5': () => pick([() => decMul(2, 1, 1, 1), () => decDiv(2, 1, 1, 0)])(),
  'w6-1': fracMulInt, 'w6-2': fracMul, 'w6-3': fracDiv,
  'w6-4': fracReducible,
  'w6-5': () => pick([fracMul, fracDiv, fracReducible])(),
};

export function generateProblem(stageId: string): Problem {
  const gen = gens[stageId];
  if (!gen) throw new Error(`unknown stage: ${stageId}`);
  return gen();
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npm test` → Expected: PASS（全ステージ×100サンプル）

- [ ] **Step 5: Commit**

```bash
git add math-quest/lib/problems.ts math-quest/tests/problems.test.ts
git commit -m "math-quest: add problem generator for all 31 stages"
```

---

### Task 4: 答え合わせ・問題表示文字列・解説生成

**Files:**
- Create: `math-quest/lib/check.ts`
- Test: `math-quest/tests/check.test.ts`

**Interfaces:**
- Consumes: `Problem`, `AnswerInput`, `Fraction`
- Produces:
  - `checkAnswer(p: Problem, input: AnswerInput): boolean` — 分数は同値なら正解（約分忘れも正解扱い）
  - `problemText(p: Problem): string` — 表示用（例 `23 × 45`、分数は `2/3 ÷ 4/5` 形式。UI側で分数レンダリング）
  - `correctText(p: Problem): string` — 正解表示用（divmod は `9 あまり 2`、分数は `3/4`）
  - `explainLines(p: Problem): string[]` — その場解説（1行ずつ表示）

- [ ] **Step 1: 失敗するテストを書く**

`math-quest/tests/check.test.ts`:

```ts
import { expect, test } from 'vitest';
import { checkAnswer, problemText, correctText, explainLines } from '@/lib/check';
import type { Problem } from '@/lib/types';

const mul: Problem = { kind: 'mul', a: 23, b: 45, answer: 1035 };
const dm: Problem = { kind: 'divmod', a: 50, b: 7, q: 7, r: 1 };
const fd: Problem = { kind: 'frac-div', a: { n: 2, d: 3 }, b: { n: 4, d: 5 }, answer: { n: 5, d: 6 } };
const dec: Problem = { kind: 'dec-mul', a: '2.4', b: '0.5', answer: '1.2' };

test('checkAnswer basics', () => {
  expect(checkAnswer(mul, { value: '1035' })).toBe(true);
  expect(checkAnswer(mul, { value: '1030' })).toBe(false);
  expect(checkAnswer(mul, { value: '' })).toBe(false);
  expect(checkAnswer(dm, { q: '7', r: '1' })).toBe(true);
  expect(checkAnswer(dm, { q: '7', r: '2' })).toBe(false);
});

test('decimal: 1.2 と 1.20 は同じ', () => {
  expect(checkAnswer(dec, { value: '1.2' })).toBe(true);
  expect(checkAnswer(dec, { value: '1.20' })).toBe(true);
  expect(checkAnswer(dec, { value: '12' })).toBe(false);
});

test('fraction: 同値なら正解（約分忘れOK）', () => {
  expect(checkAnswer(fd, { n: '5', d: '6' })).toBe(true);
  expect(checkAnswer(fd, { n: '10', d: '12' })).toBe(true);
  expect(checkAnswer(fd, { n: '5', d: '7' })).toBe(false);
  expect(checkAnswer(fd, { n: '5', d: '0' })).toBe(false);
});

test('display texts', () => {
  expect(problemText(mul)).toBe('23 × 45');
  expect(correctText(dm)).toBe('7 あまり 1');
  expect(correctText(fd)).toBe('5/6');
});

test('explain: 筆算かけ算は部分積を示す', () => {
  const lines = explainLines(mul).join('\n');
  expect(lines).toContain('23 × 5 = 115');
  expect(lines).toContain('23 × 40 = 920');
  expect(lines).toContain('115 + 920 = 1035');
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npm test` → Expected: FAIL

- [ ] **Step 3: 実装**

`math-quest/lib/check.ts`:

```ts
import type { Problem, AnswerInput, Fraction } from './types';

const toInt = (s: string | undefined): number | null => {
  if (s == null || !/^\d+$/.test(s.trim())) return null;
  return parseInt(s.trim(), 10);
};
const toNum = (s: string | undefined): number | null => {
  if (s == null || !/^\d+(\.\d+)?$/.test(s.trim())) return null;
  return Number(s.trim());
};

export function checkAnswer(p: Problem, input: AnswerInput): boolean {
  switch (p.kind) {
    case 'mul': case 'div':
      return toInt(input.value) === p.answer;
    case 'divmod':
      return toInt(input.q) === p.q && toInt(input.r) === p.r;
    case 'dec-mul': case 'dec-div':
      return toNum(input.value) !== null && toNum(input.value) === Number(p.answer);
    case 'frac-mul': case 'frac-div': {
      const n = toInt(input.n), d = toInt(input.d);
      if (n === null || d === null || d === 0) return false;
      return n * p.answer.d === p.answer.n * d; // 同値判定
    }
  }
}

const fracStr = (f: Fraction) => (f.d === 1 ? String(f.n) : `${f.n}/${f.d}`);

export function problemText(p: Problem): string {
  switch (p.kind) {
    case 'mul': return `${p.a} × ${p.b}`;
    case 'div': case 'divmod': return `${p.a} ÷ ${p.b}`;
    case 'dec-mul': return `${p.a} × ${p.b}`;
    case 'dec-div': return `${p.a} ÷ ${p.b}`;
    case 'frac-mul': return `${fracStr(p.a)} × ${fracStr(p.b)}`;
    case 'frac-div': return `${fracStr(p.a)} ÷ ${fracStr(p.b)}`;
  }
}

export function correctText(p: Problem): string {
  switch (p.kind) {
    case 'mul': case 'div': return String(p.answer);
    case 'divmod': return `${p.q} あまり ${p.r}`;
    case 'dec-mul': case 'dec-div': return p.answer;
    case 'frac-mul': case 'frac-div': return fracStr(p.answer);
  }
}

// 桁ごとの部分積（23×45 → 23×5, 23×40）
function partialProducts(a: number, b: number): { text: string; vals: number[] } {
  const digits = String(b).split('').reverse();
  const vals: number[] = [];
  const lines: string[] = [];
  digits.forEach((ch, i) => {
    const dv = Number(ch) * 10 ** i;
    if (dv === 0) return;
    vals.push(a * dv);
    lines.push(`${a} × ${dv} = ${a * dv}`);
  });
  if (vals.length > 1) lines.push(`${vals.join(' + ')} = ${a * b}`);
  return { text: lines.join('\n'), vals };
}

export function explainLines(p: Problem): string[] {
  switch (p.kind) {
    case 'mul': {
      if (p.b <= 9 && p.a <= 9) return [`九九で ${p.a} × ${p.b} = ${p.answer} だよ`];
      return [`くらいごとに分けて計算しよう`, ...partialProducts(p.a, p.b).text.split('\n')];
    }
    case 'div':
      return [`${p.b} × いくつ で ${p.a} になるかな?`, `${p.b} × ${p.answer} = ${p.a} だから、こたえは ${p.answer}`];
    case 'divmod':
      return [
        `${p.b} × ${p.q} = ${p.b * p.q} で、${p.a} をこえない いちばん大きい数`,
        `${p.a} − ${p.b * p.q} = ${p.r} があまり`,
        `こたえ: ${p.q} あまり ${p.r}`,
      ];
    case 'dec-mul': {
      const sa = (p.a.split('.')[1] ?? '').length, sb = (p.b.split('.')[1] ?? '').length;
      const ai = Number(p.a.replace('.', '')), bi = Number(p.b.replace('.', ''));
      return [
        `小数点をとって計算: ${ai} × ${bi} = ${ai * bi}`,
        `小数点を ${sa + sb} つ左にもどすと ${p.answer}`,
      ];
    }
    case 'dec-div':
      return [
        `わる数が整数になるように、両方の小数点を同じだけ動かそう`,
        `そのあとはふつうのわり算。こたえは ${p.answer}`,
      ];
    case 'frac-mul':
      return [
        `分子どうし、分母どうしをかける`,
        `${p.a.n} × ${p.b.n} = ${p.a.n * p.b.n}、 ${p.a.d} × ${p.b.d} = ${p.a.d * p.b.d}`,
        `約分すると ${correctText(p)}`,
      ];
    case 'frac-div':
      return [
        `わり算は「ひっくり返してかけ算」！`,
        `${fracStr(p.a)} × ${p.b.d}/${p.b.n} にする`,
        `こたえは ${correctText(p)}`,
      ];
  }
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npm test` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add math-quest/lib/check.ts math-quest/tests/check.test.ts
git commit -m "math-quest: add answer checking and explanation generator"
```

---

### Task 5: スコア計算とストリーク計算

**Files:**
- Create: `math-quest/lib/scoring.ts`
- Create: `math-quest/lib/streak.ts`
- Test: `math-quest/tests/scoring.test.ts`

**Interfaces:**
- Produces:
  - `coinsFor(correct: boolean, elapsedMs: number, combo: number): number` — 不正解は常に0（減点しない）。正解=10、5秒未満+5、combo(直前からの連続正解数)×1を加算（コンボ加算は最大10）
  - `todayJST(now?: Date): string` — Asia/Tokyo の YYYY-MM-DD
  - `nextStreak(lastPlayDate: string | null, today: string, current: number): number` — 同日=そのまま、前日=+1、それ以外=1

- [ ] **Step 1: 失敗するテストを書く**

`math-quest/tests/scoring.test.ts`:

```ts
import { expect, test } from 'vitest';
import { coinsFor } from '@/lib/scoring';
import { todayJST, nextStreak } from '@/lib/streak';

test('coinsFor', () => {
  expect(coinsFor(false, 1000, 5)).toBe(0);
  expect(coinsFor(true, 8000, 0)).toBe(10);
  expect(coinsFor(true, 3000, 0)).toBe(15);
  expect(coinsFor(true, 3000, 3)).toBe(18);
  expect(coinsFor(true, 3000, 99)).toBe(25); // コンボ加算は最大10
});

test('todayJST converts UTC correctly', () => {
  // UTC 2026-08-04 20:00 = JST 2026-08-05 05:00
  expect(todayJST(new Date('2026-08-04T20:00:00Z'))).toBe('2026-08-05');
  expect(todayJST(new Date('2026-08-04T10:00:00Z'))).toBe('2026-08-04');
});

test('nextStreak', () => {
  expect(nextStreak(null, '2026-08-04', 0)).toBe(1);
  expect(nextStreak('2026-08-03', '2026-08-04', 4)).toBe(5);
  expect(nextStreak('2026-08-04', '2026-08-04', 4)).toBe(4);
  expect(nextStreak('2026-08-01', '2026-08-04', 4)).toBe(1);
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npm test` → Expected: FAIL

- [ ] **Step 3: 実装**

`math-quest/lib/scoring.ts`:

```ts
export function coinsFor(correct: boolean, elapsedMs: number, combo: number): number {
  if (!correct) return 0;
  return 10 + (elapsedMs < 5000 ? 5 : 0) + Math.min(combo, 10);
}
```

`math-quest/lib/streak.ts`:

```ts
export function todayJST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(now);
}

export function nextStreak(lastPlayDate: string | null, today: string, current: number): number {
  if (lastPlayDate === today) return current;
  if (lastPlayDate) {
    const prev = new Date(lastPlayDate + 'T00:00:00Z');
    const cur = new Date(today + 'T00:00:00Z');
    if (cur.getTime() - prev.getTime() === 86400000) return current + 1;
  }
  return 1;
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npm test` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add math-quest/lib/scoring.ts math-quest/lib/streak.ts math-quest/tests/scoring.test.ts
git commit -m "math-quest: add coin scoring and JST streak logic"
```

---

### Task 6: DBスキーマ・DBクライアント・セッション署名

**Files:**
- Create: `math-quest/db/schema.sql`
- Create: `math-quest/lib/db.ts`
- Create: `math-quest/lib/session.ts`
- Create: `math-quest/.env.local.example`
- Test: `math-quest/tests/session.test.ts`

**Interfaces:**
- Consumes: 環境変数 `DATABASE_URL`, `SESSION_SECRET`
- Produces:
  - `sql` — `@neondatabase/serverless` の neon() タグ付きテンプレート
  - `hashCode(code: string): string` / `verifyCode(code: string, hash: string): boolean` — scrypt+salt
  - `signSession(playerId: number): string` / `verifySession(token: string): number | null` — HMAC署名トークン
  - `SESSION_COOKIE = 'mq_session'`
- 注意: `.env.local` はコミット禁止。`math-quest/.gitignore`（create-next-app生成）の `.env*` 行は残したまま、`!.env.local.example` の否定行だけを追加する（`.env*` を狭めて素の `.env` がコミット可能になる変更は禁止）。

- [ ] **Step 1: 依存追加とスキーマ**

```bash
cd math-quest && npm i @neondatabase/serverless
```

`math-quest/db/schema.sql`:

```sql
create table if not exists family (
  id serial primary key,
  code_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists player (
  id serial primary key,
  family_id int not null references family(id),
  coins int not null default 0,
  streak int not null default 0,
  last_play_date date,
  current_stage text not null default 'w1-1',
  created_at timestamptz not null default now()
);

create table if not exists progress (
  player_id int not null references player(id),
  stage_id text not null,
  stars int not null default 1,
  cleared_at timestamptz not null default now(),
  primary key (player_id, stage_id)
);

create table if not exists mistakes (
  id serial primary key,
  player_id int not null references player(id),
  problem jsonb not null,
  wrong_answer text not null,
  correct_streak int not null default 0,
  graduated boolean not null default false,
  created_at timestamptz not null default now()
);
```

`math-quest/.env.local.example`:

```
DATABASE_URL=postgres://user:pass@host/db
SESSION_SECRET=long-random-string-here
```

- [ ] **Step 2: 失敗するテストを書く（session）**

`math-quest/tests/session.test.ts`:

```ts
import { beforeAll, expect, test } from 'vitest';
import { hashCode, verifyCode, signSession, verifySession } from '@/lib/session';

beforeAll(() => { process.env.SESSION_SECRET = 'test-secret'; });

test('hashCode/verifyCode', () => {
  const h = hashCode('りんご325');
  expect(h).not.toContain('りんご');
  expect(verifyCode('りんご325', h)).toBe(true);
  expect(verifyCode('りんご326', h)).toBe(false);
});

test('signSession/verifySession', () => {
  const t = signSession(42);
  expect(verifySession(t)).toBe(42);
  expect(verifySession(t + 'x')).toBeNull();
  expect(verifySession('12.abcdef')).toBeNull();
});

test('malformed inputs never throw', () => {
  expect(verifyCode('abc', 'not-a-valid-stored-hash')).toBe(false);
  expect(verifyCode('abc', 'salt:zzzz')).toBe(false);
  expect(verifySession('12.' + 'é'.repeat(64))).toBeNull();
  expect(verifySession('12.' + 'ab'.repeat(10))).toBeNull();
  expect(verifySession('')).toBeNull();
});
```

- [ ] **Step 3: 失敗を確認**

Run: `npm test` → Expected: FAIL

- [ ] **Step 4: 実装**

`math-quest/lib/db.ts`:

```ts
import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL!);
```

`math-quest/lib/session.ts`:

```ts
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'mq_session';

export function hashCode(code: string): string {
  const salt = randomBytes(16).toString('hex');
  const h = scryptSync(code.normalize('NFKC'), salt, 32).toString('hex');
  return `${salt}:${h}`;
}

export function verifyCode(code: string, stored: string): boolean {
  const [salt, h] = stored.split(':');
  // 64桁hex以外は不正（長さ違いでtimingSafeEqualが例外を投げるのを防ぐ）
  if (!salt || !h || !/^[0-9a-f]{64}$/.test(h)) return false;
  const got = scryptSync(code.normalize('NFKC'), salt, 32);
  return timingSafeEqual(got, Buffer.from(h, 'hex'));
}

const hmac = (msg: string) =>
  createHmac('sha256', process.env.SESSION_SECRET!).update(msg).digest('hex');

export function signSession(playerId: number): string {
  return `${playerId}.${hmac(String(playerId))}`;
}

export function verifySession(token: string | undefined): number | null {
  if (!token) return null;
  const [id, sig] = token.split('.');
  // sigは64桁hex限定（マルチバイト文字などでtimingSafeEqualが例外を投げるのを防ぐ）
  if (!id || !sig || !/^\d+$/.test(id) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const expect = hmac(id);
  if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expect, 'hex'))) return null;
  return Number(id);
}
```

- [ ] **Step 5: テスト成功を確認**

Run: `npm test` → Expected: PASS

- [ ] **Step 6: .gitignore 確認と Commit**

`math-quest/.gitignore` に `.env*` があることを確認（なければ追加）してから:

```bash
git add math-quest && git commit -m "math-quest: add db schema, neon client, session signing"
```

---

### Task 7: 認証API（合い言葉）とAPIヘルパー

**Files:**
- Create: `math-quest/app/api/auth/route.ts`
- Create: `math-quest/lib/api.ts`（route共通: セッション取得ヘルパー）

**Interfaces:**
- Consumes: `sql`, `hashCode`, `verifyCode`, `signSession`, `verifySession`, `SESSION_COOKIE`
- Produces:
  - `POST /api/auth` body `{ code: string }` → 200 `{ ok: true }` + httpOnly cookie。家族が1件も無ければその合い言葉で新規作成（family+player）。あれば照合し、不一致は 401 `{ ok: false }`
  - `requirePlayer(req: Request): Promise<number | null>`（lib/api.ts）— cookieからplayerId取得
- テスト方針: このタスクはDB依存のためユニットテストなし。Task 12 のデプロイ前に `npm run dev` + curl で動作確認する。

- [ ] **Step 1: APIヘルパー実装**

`math-quest/lib/api.ts`:

```ts
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession } from './session';

export async function requirePlayer(): Promise<number | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' },
  });
```

- [ ] **Step 2: 認証route実装**

`math-quest/app/api/auth/route.ts`:

```ts
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import { hashCode, verifyCode, signSession, SESSION_COOKIE } from '@/lib/session';
import { json } from '@/lib/api';

export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== 'string' || code.trim().length < 3)
    return json({ ok: false, error: 'あいことばは3もじいじょうにしてね' }, 400);
  const trimmed = code.trim(); // 前後の空白ちがいでログイン不能になるのを防ぐ

  // order by id で決定論的に最初のfamilyを使う（万一2行できても常に同じ行）
  const families = await sql`select id, code_hash from family order by id limit 1`;
  let playerId: number;

  if (families.length === 0) {
    const fam = await sql`insert into family (code_hash) values (${hashCode(trimmed)}) returning id`;
    const pl = await sql`insert into player (family_id) values (${fam[0].id}) returning id`;
    playerId = pl[0].id;
  } else {
    if (!verifyCode(trimmed, families[0].code_hash))
      return json({ ok: false, error: 'あいことばがちがうみたい' }, 401);
    // playerが無ければ自動作成（登録が途中で失敗していても復旧できる）
    let pl = await sql`select id from player where family_id = ${families[0].id} order by id limit 1`;
    if (pl.length === 0)
      pl = await sql`insert into player (family_id) values (${families[0].id}) returning id`;
    playerId = pl[0].id;
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(playerId), {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, path: '/',
  });
  return json({ ok: true });
}
```

- [ ] **Step 3: ビルド確認**

Run: `cd math-quest && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: Commit**

```bash
git add math-quest/app/api math-quest/lib/api.ts
git commit -m "math-quest: add family-code auth API with signed cookie"
```

---

### Task 8: プレイヤー状態・進捗・まちがい・ミッションAPI

**Files:**
- Create: `math-quest/lib/mission.ts`（純粋ロジック）
- Create: `math-quest/app/api/state/route.ts`
- Create: `math-quest/app/api/answer/route.ts`
- Create: `math-quest/app/api/stage-clear/route.ts`
- Create: `math-quest/app/api/mission-complete/route.ts`
- Test: `math-quest/tests/mission.test.ts`

**Interfaces:**
- Consumes: `sql`, `requirePlayer`, `json`, `nextStreak`, `todayJST`, `generateProblem`, `Problem`, `nextStageId`
- Produces:
  - `buildMission(reviews: Problem[], stageId: string, total?: number): { problem: Problem; isReview: boolean }[]`（lib/mission.ts、total省略時10問。復習は先頭に最大3問、残りはstageIdから生成）
  - `GET /api/state` → `{ coins, streak, lastPlayDate, currentStage, clearedStages: {stageId, stars}[], missionDoneToday: boolean, reviewProblems: {id, problem}[] }`（reviewProblems = 未卒業mistakesから最大3件、古い順）
  - `POST /api/answer` body `{ problem, correct: boolean, wrongAnswer?: string, coins: number, mistakeId?: number }` → まちがい記録/卒業更新+コイン加算。返り値 `{ coins, graduated?: boolean }`
    - 卒業規則: correct かつ mistakeId あり → `correct_streak+1`、2に達したら `graduated=true`。不正解なら `correct_streak=0`
    - mistakeId なしで不正解 → mistakes に新規行を insert
  - `POST /api/stage-clear` body `{ stageId, stars }` → progress upsert（starsは既存より大きい時のみ更新）、currentStage を nextStageId に前進
  - `POST /api/mission-complete` → streak更新+ボーナス50コイン付与、`{ streak, coins }`。同日2回目は加算なしで現状を返す

- [ ] **Step 1: 失敗するテストを書く（mission）**

`math-quest/tests/mission.test.ts`:

```ts
import { expect, test } from 'vitest';
import { buildMission } from '@/lib/mission';
import type { Problem } from '@/lib/types';

const rev = (n: number): Problem => ({ kind: 'mul', a: n, b: 2, answer: n * 2 });

test('10問構成: 復習は最大3問が先頭、残りはステージ問題', () => {
  const m = buildMission([rev(1), rev(2), rev(3), rev(4)], 'w1-1');
  expect(m).toHaveLength(10);
  expect(m.slice(0, 3).every(x => x.isReview)).toBe(true);
  expect(m.slice(3).every(x => !x.isReview)).toBe(true);
});

test('復習が無ければ全問ステージ問題', () => {
  const m = buildMission([], 'w1-1');
  expect(m).toHaveLength(10);
  expect(m.every(x => !x.isReview)).toBe(true);
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npm test` → Expected: FAIL

- [ ] **Step 3: mission実装**

`math-quest/lib/mission.ts`:

```ts
import type { Problem } from './types';
import { generateProblem } from './problems';

export function buildMission(
  reviews: Problem[], stageId: string, total = 10,
): { problem: Problem; isReview: boolean }[] {
  const rev = reviews.slice(0, 3).map(problem => ({ problem, isReview: true }));
  const fresh = Array.from({ length: total - rev.length }, () => ({
    problem: generateProblem(stageId), isReview: false,
  }));
  return [...rev, ...fresh];
}
```

- [ ] **Step 4: テスト成功を確認** → Run: `npm test` → PASS

- [ ] **Step 5: 各routeを実装**

`math-quest/app/api/state/route.ts`:

```ts
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
```

`math-quest/app/api/answer/route.ts`:

```ts
import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';

export async function POST(req: Request) {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const { problem, correct, wrongAnswer, coins, mistakeId } = await req.json().catch(() => ({}));
  if (typeof correct !== 'boolean' || typeof coins !== 'number' || coins < 0 || coins > 100)
    return json({ ok: false }, 400);

  let graduated = false;
  if (mistakeId != null) {
    if (correct) {
      const [row] = await sql`
        update mistakes set correct_streak = correct_streak + 1,
          graduated = (correct_streak + 1 >= 2)
        where id = ${mistakeId} and player_id = ${pid}
        returning graduated`;
      graduated = row?.graduated ?? false;
    } else {
      await sql`update mistakes set correct_streak = 0
        where id = ${mistakeId} and player_id = ${pid}`;
    }
  } else if (!correct && problem) {
    await sql`insert into mistakes (player_id, problem, wrong_answer)
      values (${pid}, ${JSON.stringify(problem)}, ${String(wrongAnswer ?? '')})`;
  }
  const [p] = await sql`
    update player set coins = coins + ${correct ? coins : 0}
    where id = ${pid} returning coins`;
  if (!p) return json({ ok: false }, 401);
  return json({ ok: true, coins: p.coins, graduated });
}
```

`math-quest/app/api/stage-clear/route.ts`:

```ts
import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';
import { nextStageId, stageById } from '@/lib/stages';

export async function POST(req: Request) {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const { stageId, stars } = await req.json().catch(() => ({}));
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
  return json({ ok: true, nextStage: next });
}
```

`math-quest/app/api/mission-complete/route.ts`:

```ts
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
```

- [ ] **Step 6: ビルド確認** → Run: `npx tsc --noEmit` → エラーなし

- [ ] **Step 7: Commit**

```bash
git add math-quest/lib/mission.ts math-quest/app/api math-quest/tests/mission.test.ts
git commit -m "math-quest: add state/answer/stage-clear/mission APIs"
```

---

### Task 9: クイズUI（テンキー・クイズエンジン・解説表示）

**Files:**
- Create: `math-quest/app/globals.css`（create-next-app生成物を全置換）
- Create: `math-quest/components/Keypad.tsx`
- Create: `math-quest/components/AnswerForm.tsx`
- Create: `math-quest/components/QuizRunner.tsx`
- Create: `math-quest/app/quiz/[stageId]/page.tsx`

**Interfaces:**
- Consumes: `generateProblem`, `checkAnswer`, `problemText`, `correctText`, `explainLines`, `coinsFor`, `buildMission`, API `/api/answer` `/api/stage-clear` `/api/mission-complete` `/api/state`
- Produces:
  - `<Keypad onKey={(k: string) => void} keys={string[]} />` — 44px以上のボタン。keysは `['1'..'9','0','.','←','OK']` などを渡す
  - `<AnswerForm problem={Problem} onSubmit={(input: AnswerInput) => void} />` — kindに応じて入力欄を出し分け（divmod=商とあまりの2欄、frac=分子分母2欄）
  - `<QuizRunner stageId={string} reviews={{id: number, problem: Problem}[]} onFinish={(result: {correctCount: number; total: number}) => void} />` — reviewsが空なら全問ステージ問題（=stageモード相当）
  - ページ `/quiz/[stageId]` — stageモード（reviews=[]）。`/quiz/mission` は特別扱いで現在ステージ+復習問題のmissionモード
- 動作仕様:
  - 正解: 「せいかい！ +Nコイン」を1秒表示して次へ。コンボ数表示
  - 不正解: `explainLines` を1行ずつ表示、「わかった！」ボタンで次へ。`/api/answer` に記録
  - 全問終了: 正答率で★（100%=3、80%以上=2、それ以下=1）。stageモードは `/api/stage-clear`、missionモードは `/api/mission-complete` を呼ぶ

- [ ] **Step 1: グローバルCSS**

`math-quest/app/globals.css`（全置換）:

```css
:root {
  --bg: #1a1440;
  --card: #2a2160;
  --accent: #ffb703;
  --good: #4ade80;
  --bad: #fb7185;
  --text: #ffffff;
  --muted: #b8b0e0;
  --radius: 16px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  background: var(--bg); color: var(--text);
  font-family: 'Hiragino Maru Gothic ProN', 'BIZ UDGothic', system-ui, sans-serif;
  -webkit-tap-highlight-color: transparent;
}
main { max-width: 480px; margin: 0 auto; padding: 16px; min-height: 100dvh; }
button {
  font: inherit; color: inherit; border: none; border-radius: var(--radius);
  min-height: 48px; cursor: pointer;
}
.btn-primary { background: var(--accent); color: #1a1440; font-weight: bold; font-size: 1.2rem; padding: 12px 24px; width: 100%; }
.card { background: var(--card); border-radius: var(--radius); padding: 16px; }
```

- [ ] **Step 2: Keypad実装**

`math-quest/components/Keypad.tsx`:

```tsx
'use client';

export default function Keypad({ keys, onKey }: { keys: string[]; onKey: (k: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {keys.map(k => (
        <button
          key={k}
          onClick={() => onKey(k)}
          style={{
            minHeight: 56, fontSize: '1.5rem', fontWeight: 'bold',
            background: k === 'OK' ? 'var(--good)' : 'var(--card)',
            color: k === 'OK' ? '#1a1440' : 'var(--text)',
            // 3の倍数でないときだけOKを最終行いっぱいに広げる（すきま防止）
            gridColumn: k === 'OK' && keys.length % 3 !== 0 ? '1 / -1' : undefined,
          }}
        >
          {k === '←' ? '⌫' : k}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: AnswerForm実装**

`math-quest/components/AnswerForm.tsx`:

```tsx
'use client';
import { useState } from 'react';
import type { Problem, AnswerInput } from '@/lib/types';
import Keypad from './Keypad';

type Field = 'value' | 'q' | 'r' | 'n' | 'd';

const fieldsFor = (p: Problem): { field: Field; label: string }[] => {
  if (p.kind === 'divmod') return [{ field: 'q', label: 'こたえ' }, { field: 'r', label: 'あまり' }];
  if (p.kind === 'frac-mul' || p.kind === 'frac-div')
    return [{ field: 'n', label: '分子(上)' }, { field: 'd', label: '分母(下)' }];
  return [{ field: 'value', label: 'こたえ' }];
};

export default function AnswerForm({ problem, onSubmit }:
  { problem: Problem; onSubmit: (input: AnswerInput) => void }) {
  const fields = fieldsFor(problem);
  const [vals, setVals] = useState<AnswerInput>({});
  const [active, setActive] = useState<Field>(fields[0].field);
  const dec = problem.kind === 'dec-mul' || problem.kind === 'dec-div';
  // 12キー(3×4)ぴったり。小数のときだけ '.' を足して13キー（OKは最終行いっぱい）
  const keys = dec
    ? ['7','8','9','4','5','6','1','2','3','.','0','←','OK']
    : ['7','8','9','4','5','6','1','2','3','←','0','OK'];

  // 未入力・末尾が「.」だけの欄は「まだ書けてない」とみなす
  const incomplete = (f: Field) => {
    const v = vals[f] ?? '';
    return v.length === 0 || v.endsWith('.');
  };

  const onKey = (k: string) => {
    if (k === 'OK') {
      if (incomplete(active)) return; // 何も入れずにすすませない
      const idx = fields.findIndex(f => f.field === active);
      if (idx < fields.length - 1) { setActive(fields[idx + 1].field); return; }
      const blank = fields.find(f => incomplete(f.field));
      if (blank) { setActive(blank.field); return; } // 空の欄にもどす
      onSubmit(vals); return;
    }
    setVals(v => {
      const cur = v[active] ?? '';
      if (k === '←') return { ...v, [active]: cur.slice(0, -1) };
      if (cur.length >= 7) return v;
      if (k === '.' && cur.includes('.')) return v;
      return { ...v, [active]: cur + k };
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {fields.map(f => (
          <button key={f.field} onClick={() => setActive(f.field)} className="card"
            style={{ flex: 1, outline: active === f.field ? '3px solid var(--accent)' : 'none' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{f.label}</div>
            <div style={{ fontSize: '1.6rem', minHeight: '2rem' }}>{vals[f.field] || '　'}</div>
          </button>
        ))}
      </div>
      <Keypad keys={keys} onKey={onKey} />
    </div>
  );
}
```

- [ ] **Step 4: QuizRunner実装**

`math-quest/components/QuizRunner.tsx`:

```tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Problem, AnswerInput } from '@/lib/types';
import { checkAnswer, problemText, correctText, explainLines } from '@/lib/check';
import { coinsFor } from '@/lib/scoring';
import { buildMission } from '@/lib/mission';
import AnswerForm from './AnswerForm';

type Item = { problem: Problem; isReview: boolean; mistakeId?: number };
type Phase = { name: 'ask' } | { name: 'correct'; coins: number } | { name: 'wrong' } | { name: 'done' };

export default function QuizRunner({ stageId, reviews, onFinish }: {
  stageId: string;
  reviews: { id: number; problem: Problem }[];
  onFinish: (r: { correctCount: number; total: number }) => void;
}) {
  const items: Item[] = useMemo(() => {
    const m = buildMission(reviews.map(r => r.problem), stageId);
    return m.map((x, i) => ({ ...x, mistakeId: x.isReview ? reviews[i]?.id : undefined }));
  }, [stageId, reviews]);

  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: 'ask' });
  const [combo, setCombo] = useState(0);
  const [startMs, setStartMs] = useState(Date.now());
  // 正解数はrefで持つ（setTimeout内のnextがstateの古い値を読むのを防ぐ）
  const correctRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const item = items[i];

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const next = () => {
    if (i + 1 >= items.length) {
      setPhase({ name: 'done' });
      onFinish({ correctCount: correctRef.current, total: items.length });
      return;
    }
    setI(i + 1); setPhase({ name: 'ask' }); setStartMs(Date.now());
  };

  const submit = (input: AnswerInput) => {
    const correct = checkAnswer(item.problem, input);
    const coins = coinsFor(correct, Date.now() - startMs, combo);
    setPhase(correct ? { name: 'correct', coins } : { name: 'wrong' });
    setCombo(correct ? combo + 1 : 0);
    if (correct) correctRef.current += 1;
    fetch('/api/answer', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        problem: item.problem, correct, coins,
        wrongAnswer: input.value ?? `${input.q ?? input.n ?? ''}/${input.r ?? input.d ?? ''}`,
        mistakeId: item.mistakeId,
      }),
    }).catch(() => {});
    if (correct) timerRef.current = setTimeout(next, 1000);
  };

  if (!item || phase.name === 'done') return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: 'var(--muted)' }}>
        <span>{i + 1} / {items.length} もんめ</span>
        {combo >= 2 && <span style={{ color: 'var(--accent)' }}>🔥 {combo} コンボ</span>}
        {item.isReview && <span>ふくしゅう</span>}
      </div>
      <div className="card" style={{ textAlign: 'center', fontSize: '2.2rem', fontWeight: 'bold', margin: '12px 0' }}>
        {problemText(item.problem)} = ?
      </div>

      {phase.name === 'ask' && <AnswerForm key={i} problem={item.problem} onSubmit={submit} />}

      {phase.name === 'correct' && (
        <div className="card" style={{ textAlign: 'center', background: 'var(--good)', color: '#1a1440' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>せいかい！</div>
          <div>+{phase.coins} コイン</div>
        </div>
      )}

      {phase.name === 'wrong' && (
        <div className="card">
          <div style={{ color: 'var(--bad)', fontWeight: 'bold', marginBottom: 8 }}>
            ざんねん… こたえは {correctText(item.problem)}
          </div>
          {explainLines(item.problem).map((l, j) => (
            <p key={j} style={{ margin: '4px 0', color: 'var(--muted)' }}>{l}</p>
          ))}
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={next}>わかった！</button>
        </div>
      )}
    </div>
  );
}
```

注意: 正解数は `correctRef` で管理する（`setTimeout(next, 1000)` が捕捉するクロージャは submit 時点の render のもので、state の `correctCount` だと最後の1問の正解が数え漏れる）。`next` は `submit` より前に定義すること。

- [ ] **Step 5: クイズページ実装**

`math-quest/app/quiz/[stageId]/page.tsx`:

```tsx
'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QuizRunner from '@/components/QuizRunner';
import { stageById } from '@/lib/stages';
import type { Problem } from '@/lib/types';

type State = { currentStage: string; reviewProblems: { id: number; problem: Problem }[] };

const starsFor = (correctCount: number, total: number) =>
  correctCount === total ? 3 : correctCount / total >= 0.8 ? 2 : 1;

export default function QuizPage({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = use(params);
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [result, setResult] = useState<{ correctCount: number; total: number } | null>(null);
  const isMission = stageId === 'mission';

  useEffect(() => {
    fetch('/api/state').then(r => r.json()).then(d => {
      if (!d.ok) { router.replace('/login'); return; }
      setState(d);
    }).catch(() => setState({ currentStage: 'w1-1', reviewProblems: [] }));
  }, [router]);

  if (!state) return <main><p>じゅんびちゅう…</p></main>;

  const realStage = isMission ? state.currentStage : stageId;
  if (!stageById(realStage)) return <main><p>そのステージはないみたい</p></main>;

  const finish = async (r: { correctCount: number; total: number }) => {
    setResult(r);
    const stars = starsFor(r.correctCount, r.total);
    if (isMission) await fetch('/api/mission-complete', { method: 'POST' }).catch(() => {});
    else await fetch('/api/stage-clear', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stageId: realStage, stars }),
    }).catch(() => {});
  };

  return (
    <main>
      <h1 style={{ fontSize: '1.1rem', margin: '8px 0 16px' }}>
        {isMission ? 'きょうのミッション' : stageById(realStage)!.title}
      </h1>
      {!result && (
        <QuizRunner stageId={realStage}
          reviews={isMission ? state.reviewProblems : []} onFinish={finish} />
      )}
      {result && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>
            {'★'.repeat(starsFor(result.correctCount, result.total))}
          </div>
          <p style={{ margin: '8px 0' }}>{result.total}もん中 {result.correctCount}もん せいかい！</p>
          <button className="btn-primary" onClick={() => router.push('/')}>ホームへ</button>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 6: プレビューで動作確認**

`.claude/launch.json` に設定を追加して preview_start で `math-quest` dev サーバーを起動（`npm run dev`, port 3000）。モバイルサイズ(375×812)で:
- `/quiz/w1-1` を開き、九九の問題が出る・テンキーで回答できる・正解/不正解の表示が出る・10問で★画面になることを確認
- DB未設定のためAPI呼び出しは失敗してよい（catchで握る設計）。コンソールに未捕捉エラーが無いことを確認

- [ ] **Step 7: Commit**

```bash
git add math-quest/app math-quest/components
git commit -m "math-quest: add quiz UI with keypad, combo, explanations"
```

---

### Task 10: ログイン・ホーム・冒険マップ画面

**Files:**
- Create: `math-quest/app/login/page.tsx`
- Create: `math-quest/app/page.tsx`（create-next-app生成物を全置換）
- Create: `math-quest/app/map/page.tsx`
- Modify: `math-quest/app/layout.tsx`（タイトルとlang="ja"）

**Interfaces:**
- Consumes: `GET /api/state`, `POST /api/auth`, `STAGES`, `WORLDS`
- Produces: 画面遷移 `/login` → `/`（ホーム）→ `/map` → `/quiz/[stageId]`、ホームから `/quiz/mission`

- [ ] **Step 1: layout修正**

`math-quest/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'さんすうクエスト', description: 'かけ算・わり算 まいにちトレーニング' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: ログイン画面**

`math-quest/app/login/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async () => {
    if (busy || code.trim().length < 3) return; // 二重送信と空送信を防ぐ
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const d = await r.json();
      if (d.ok) router.push('/');
      else setError(d.error ?? 'あいことばがちがうみたい');
    } catch {
      setError('でんぱがよわいみたい。もういちどためしてね');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
      <h1 style={{ textAlign: 'center' }}>さんすうクエスト</h1>
      <p style={{ textAlign: 'center', color: 'var(--muted)' }}>あいことばを いれてね</p>
      <input
        value={code} onChange={e => setCode(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        style={{ fontSize: '1.4rem', padding: 12, borderRadius: 16, border: 'none', textAlign: 'center' }}
        placeholder="あいことば"
      />
      {error && <p style={{ color: 'var(--bad)', textAlign: 'center' }}>{error}</p>}
      <button className="btn-primary" onClick={submit} disabled={busy || code.trim().length < 3}
        style={{ opacity: busy || code.trim().length < 3 ? 0.5 : 1 }}>
        {busy ? 'まってね…' : 'はじめる'}
      </button>
    </main>
  );
}
```

- [ ] **Step 3: ホーム画面**

`math-quest/app/page.tsx`（全置換）:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { stageById, STAGES } from '@/lib/stages';

type State = {
  ok: boolean; coins: number; streak: number; currentStage: string;
  missionDoneToday: boolean; reviewProblems: unknown[];
};

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/state').then(r => r.json()).then(d => {
      if (!d.ok) router.replace('/login'); else setState(d);
    }).catch(() => router.replace('/login'));
  }, [router]);

  if (!state) return <main><p>じゅんびちゅう…</p></main>;

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
        <span>🔥 {state.streak}日れんぞく</span>
        <span>🪙 {state.coins}</span>
      </header>

      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '4rem' }}>🐣</div>
        <p style={{ color: 'var(--muted)' }}>（アバターは これから そだつよ）</p>
      </div>

      <Link href="/quiz/mission">
        <button className="btn-primary">
          {state.missionDoneToday ? 'きょうのミッション クリアずみ！もういっかい？' : 'きょうのミッションを はじめる！'}
        </button>
      </Link>

      <Link href="/map">
        <button className="btn-primary" style={{ background: 'var(--card)', color: 'var(--text)' }}>
          ぼうけんマップ（いま: {stageById(state.currentStage)?.title ?? STAGES[0].title}）
        </button>
      </Link>

      <Link href="/notebook">
        <button className="btn-primary" style={{ background: 'var(--card)', color: 'var(--text)' }}>
          まちがいノート
        </button>
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: 冒険マップ**

`math-quest/app/map/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { STAGES, WORLDS } from '@/lib/stages';

type State = { ok: boolean; currentStage: string; clearedStages: { stageId: string; stars: number }[] };

export default function MapPage() {
  const [state, setState] = useState<State | null>(null);
  const router = useRouter();
  // 通信失敗時に「じゅんびちゅう…」で固まらないよう、ホーム同様ログインへ戻す
  useEffect(() => {
    fetch('/api/state').then(r => r.json()).then(d => {
      if (!d.ok) router.replace('/login'); else setState(d);
    }).catch(() => router.replace('/login'));
  }, [router]);
  if (!state) return <main><p>じゅんびちゅう…</p></main>;

  const stars = new Map(state.clearedStages.map(c => [c.stageId, c.stars]));
  // 未知のステージIDでも全ロックにならないよう最低0に丸める
  const currentIdx = Math.max(STAGES.findIndex(s => s.id === state.currentStage), 0);

  return (
    <main>
      <Link href="/" style={{ color: 'var(--muted)' }}>← ホーム</Link>
      <h1 style={{ margin: '12px 0' }}>ぼうけんマップ</h1>
      {WORLDS.map(w => (
        <section key={w.id} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: 8 }}>
            ワールド{w.id} {w.title}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {STAGES.filter(s => s.world === w.id).map(s => {
              const idx = STAGES.findIndex(x => x.id === s.id);
              const locked = idx > currentIdx;
              const st = stars.get(s.id);
              return (
                <Link key={s.id} href={locked ? '#' : `/quiz/${s.id}`}
                  style={{ pointerEvents: locked ? 'none' : 'auto', textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{ display: 'flex', justifyContent: 'space-between', opacity: locked ? 0.4 : 1 }}>
                    <span>{locked ? '🔒' : st ? '✅' : '▶️'} {s.title}</span>
                    <span style={{ color: 'var(--accent)' }}>{st ? '★'.repeat(st) : ''}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 5: プレビュー確認**

モバイルサイズで `/login` → 合い言葉入力（DB未設定ならエラーメッセージ表示を確認）。`/map` でロック表示・現在地が正しいこと。コンソールにエラーが無いこと。

- [ ] **Step 6: Commit**

```bash
git add math-quest/app && git commit -m "math-quest: add login, home, adventure map screens"
```

---

### Task 11: まちがいノート画面 + ノートAPI

**Files:**
- Create: `math-quest/app/api/mistakes/route.ts`
- Create: `math-quest/app/notebook/page.tsx`

**Interfaces:**
- Consumes: `sql`, `requirePlayer`, `json`, `problemText`, `correctText`, `Problem`
- Produces:
  - `GET /api/mistakes` → `{ ok, active: {id, problem, wrongAnswer}[], graduatedCount: number }`（未卒業を古い順、最大50件）
  - `/notebook` 画面 — 苦手一覧（問題・自分の答え・正解）、卒業数バッジ、「といなおす」ボタンで1問ずつ解き直し（QuizRunnerは使わず、AnswerForm+checkAnswerで簡易に。正解したら `/api/answer` に mistakeId つきPOST）

- [ ] **Step 1: mistakes API実装**

`math-quest/app/api/mistakes/route.ts`:

```ts
import { sql } from '@/lib/db';
import { requirePlayer, json } from '@/lib/api';

export async function GET() {
  const pid = await requirePlayer();
  if (!pid) return json({ ok: false }, 401);
  const active = await sql`
    select id, problem, wrong_answer from mistakes
    where player_id = ${pid} and graduated = false
    order by created_at asc limit 50`;
  const [g] = await sql`
    select count(*)::int as c from mistakes where player_id = ${pid} and graduated = true`;
  return json({
    ok: true,
    active: active.map(m => ({ id: m.id, problem: m.problem, wrongAnswer: m.wrong_answer })),
    graduatedCount: g.c,
  });
}
```

- [ ] **Step 2: ノート画面実装**

`math-quest/app/notebook/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Problem, AnswerInput } from '@/lib/types';
import { checkAnswer, problemText, correctText, explainLines } from '@/lib/check';
import AnswerForm from '@/components/AnswerForm';

type Entry = { id: number; problem: Problem; wrongAnswer: string };

export default function NotebookPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [graduated, setGraduated] = useState(0);
  const [solving, setSolving] = useState<Entry | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const router = useRouter();

  // 他画面と同じ規約：通信失敗・未ログインならログイン画面へ戻す
  const load = () => fetch('/api/mistakes').then(r => r.json()).then(d => {
    if (!d.ok) { router.replace('/login'); return; }
    setEntries(d.active); setGraduated(d.graduatedCount);
  }).catch(() => router.replace('/login'));
  useEffect(() => { load(); }, []);

  const submit = async (input: AnswerInput) => {
    if (!solving) return;
    const correct = checkAnswer(solving.problem, input);
    setFeedback(correct ? 'correct' : 'wrong');
    await fetch('/api/answer', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ problem: solving.problem, correct, coins: correct ? 10 : 0, mistakeId: solving.id }),
    }).catch(() => {});
  };

  const closeSolve = () => { setSolving(null); setFeedback(null); load(); };

  if (solving) {
    return (
      <main>
        <h1 style={{ margin: '8px 0 16px' }}>といなおし</h1>
        <div className="card" style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 'bold', marginBottom: 12 }}>
          {problemText(solving.problem)} = ?
        </div>
        {!feedback && <AnswerForm problem={solving.problem} onSubmit={submit} />}
        {feedback === 'correct' && (
          <div className="card" style={{ background: 'var(--good)', color: '#1a1440', textAlign: 'center' }}>
            <p style={{ fontWeight: 'bold', fontSize: '1.4rem' }}>せいかい！ +10コイン</p>
            <button className="btn-primary" style={{ marginTop: 8 }} onClick={closeSolve}>もどる</button>
          </div>
        )}
        {feedback === 'wrong' && (
          <div className="card">
            <p style={{ color: 'var(--bad)', fontWeight: 'bold' }}>こたえは {correctText(solving.problem)}</p>
            {explainLines(solving.problem).map((l, i) => <p key={i} style={{ color: 'var(--muted)', margin: '4px 0' }}>{l}</p>)}
            <button className="btn-primary" style={{ marginTop: 8 }} onClick={closeSolve}>もどる</button>
          </div>
        )}
      </main>
    );
  }

  return (
    <main>
      <Link href="/" style={{ color: 'var(--muted)' }}>← ホーム</Link>
      <h1 style={{ margin: '12px 0' }}>まちがいノート</h1>
      <p style={{ color: 'var(--accent)', marginBottom: 12 }}>🎓 そつぎょうした問題: {graduated}こ</p>
      {entries.length === 0 && <p className="card">いまは にがてな問題は ないよ！すごい！</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(e => (
          <div key={e.id} className="card">
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>{problemText(e.problem)}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '4px 0' }}>
              まえのこたえ: {e.wrongAnswer || '（むかいとう）'} ／ せいかい: {correctText(e.problem)}
            </div>
            <button className="btn-primary" style={{ minHeight: 44, fontSize: '1rem' }}
              onClick={() => setSolving(e)}>といなおす</button>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: ビルド確認** → `npx tsc --noEmit` → エラーなし

- [ ] **Step 4: Commit**

```bash
git add math-quest/app && git commit -m "math-quest: add mistake notebook screen and API"
```

---

### Task 12: Neonセットアップ・E2E動作確認・Vercelデプロイ

**Files:**
- Modify: なし（環境設定とデプロイのみ）

**Interfaces:**
- Consumes: 全タスクの成果物
- Produces: 本番URL（Vercel）で動くアプリ

- [ ] **Step 1: Neonデータベース作成**

Vercelダッシュボード → Storage → Neon を追加（無料枠）。ユーザーにVercelアカウントでの操作を依頼する場面。CLI代替:

```bash
cd math-quest && vercel link
```

（新規プロジェクト `math-quest` として link。その後ダッシュボードで Neon を接続し `DATABASE_URL` を取得）

- [ ] **Step 2: 環境変数設定**

```bash
cd math-quest
vercel env add DATABASE_URL production
vercel env add SESSION_SECRET production   # openssl rand -hex 32 で生成
vercel env pull .env.local                 # ローカル開発用
```

- [ ] **Step 3: スキーマ適用**

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

（psqlが無ければ Neon ダッシュボードの SQL Editor に schema.sql を貼り付けて実行）

- [ ] **Step 4: ローカルE2E確認**

`npm run dev` でプレビューを開き、モバイルサイズで通し確認:
1. `/login` で合い言葉を新規設定 → ホームに遷移
2. 「きょうのミッション」10問 → わざと2問間違える → ★とコイン・ストリーク表示
3. `/notebook` に間違えた問題が出る → といなおして正解
4. もう一度ミッション → 復習問題が先頭に出る
5. `/map` でステージクリア・★・ロック解除を確認
6. ブラウザのコンソールとネットワークにエラーが無いこと

- [ ] **Step 5: テスト全通し + デプロイ**

```bash
npm test && npx tsc --noEmit
vercel deploy --prod
```

デプロイURLをスマホで開き、ログイン→ミッション1回を通しで確認。

- [ ] **Step 6: Commit + push**

```bash
git add math-quest && git commit -m "math-quest: production deploy config" --allow-empty
git push origin main
```

---

## 計画2（このプランの後に別途作成）

以下は本計画のスコープ外。計画1完了後に `docs/superpowers/plans/` に別プランとして作成する:

- アバター（SVGブロック調キャラ・着せ替え・ショップ・アイテムカタログ・レア解放条件）
- バトル演出(モンスターHP・ボス戦・制限時間)と★評価の演出強化
- タイムアタックモード(60秒・自己ベスト)
- 保護者ページ(正答率推移・苦手分野ランキング)
- オフライン時の解答キュー(localStorage同期)
- 難易度自動調整(2連続不正解でやさしい問題を混ぜる)
