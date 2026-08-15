# math-quest 計画3（バトル演出・ボス戦）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 毎日のミッションとステージに手ごたえを足す。正解するたびにモンスターのHPが減り、倒すとボーナス。各ワールドの最後はボス戦で、倒すとレアアイテムが解放される。

**Architecture:** モンスターのカタログとダメージ計算は `lib/battle.ts` に純粋関数として持ち（問題生成・アバターと同じ方針）、描画は `components/Monster.tsx` が担う。QuizRunner にはHPバーと敵の表示を足すだけで、既存の出題・採点・コイン計算のロジックには触らない。ボス撃破は player テーブルに `defeated_bosses int[]` として記録し、アバターの解放条件に `{ kind: 'boss', world }` を追加して設計書どおりの「ボス撃破でレア解放」を実現する。

**Tech Stack:** Next.js 16 App Router / TypeScript / Vitest / @neondatabase/serverless / Vercel

## Global Constraints

- 新しいライブラリを追加しない（アニメーションライブラリも禁止。動きはCSSトランジションのみ）
- 画像素材・外部CDNを使わない。モンスターは自前のインラインSVG
- スマホ・タッチ優先UI。ボタンは最小44px
- 文言は小学6年生向け。学年で習う漢字は普通に使う（ひらがなに開きすぎない）。通信エラーは「電波が弱いみたい。もう一度試してね」
- 色は `app/globals.css` のCSS変数を使う（モンスターの体色だけはカタログが持つ固有色を使ってよい）
- 既存の規約に合わせる：APIが `!ok` またはthrowしたら `router.replace('/login')`
- **不正解でペナルティを与えない。** モンスターは反撃せず、プレイヤーのHPという概念を作らない
- 本番DBは稼働中で実データが入っている。スキーマ変更は `alter table ... add column if not exists` の追加のみ
- マイグレーション実行スクリプトは、先にコメント行を除去してから `;` で分割すること（逆順にすると「コメント＋ALTER」が1塊になり文が消える）
- 秘密情報は環境変数のみ。コミット禁止
- コミットメッセージは英語で簡潔に、`math-quest:` 接頭辞

## 設計書からの意図的な変更（2点）

設計書（`docs/superpowers/specs/2026-08-04-math-quest-design.md`）の「冒険バトル」節から、子どもの体験を優先して2点変えている。

1. **ボス戦に制限時間を設けない。** 設計書は「制限時間内に正解を重ねてボスのHPを削る」としているが、計算が苦手な子に時間制限をかけると焦って崩れやすい。ボスは制限時間ではなく「HPが多い」ことで手ごたえを出す。時間で競う遊びは別途タイムアタック（計画4）で提供する。
2. **モンスターを倒せなくてもステージはクリアできる。** 設計書は「全問終了時にHPを削り切れていればクリア」としているが、これだと不正解が実質ペナルティ（やり直し）になり、グローバル制約の「不正解でペナルティを与えない」と衝突する。★評価は今までどおり正答率で決め、モンスター撃破は**上乗せの報酬**（ボーナスコイン＋ボス撃破記録）として扱う。

---

### Task 1: モンスターカタログとダメージ計算

**Files:**
- Create: `math-quest/lib/battle.ts`
- Test: `math-quest/tests/battle.test.ts`

**Interfaces:**
- Consumes: `STAGES`, `stageById`（lib/stages）
- Produces:
  - `type MonsterShape = 'slime' | 'bat' | 'rock' | 'ghost' | 'fish' | 'dragon'`
  - `type Monster = { world: number; name: string; color: string; shape: MonsterShape }`
  - `MONSTERS: Monster[]`（ワールド1〜6に1体ずつ）
  - `monsterFor(stageId: string): Monster` — 不明なステージはワールド1のモンスターを返す
  - `isBossStage(stageId: string): boolean` — 各ワールドの最終ステージがボス
  - `bossWorldOf(stageId: string): number | null` — ボスステージならそのワールド番号
  - `maxHpFor(totalQuestions: number, isBoss: boolean): number` — 通常は `total - 2`（2問まちがえても倒せる）、ボスは `total - 1`。最低1
  - `damageFor(correct: boolean, combo: number): number` — 不正解は0、正解は1、コンボ3以上は2
  - `BOSS_BONUS_COINS = 50`、`MONSTER_BONUS_COINS = 30`

- [ ] **Step 1: 失敗するテストを書く**

`math-quest/tests/battle.test.ts`:

```ts
import { expect, test } from 'vitest';
import {
  MONSTERS, monsterFor, isBossStage, bossWorldOf, maxHpFor, damageFor,
} from '@/lib/battle';
import { STAGES } from '@/lib/stages';

test('ワールド1〜6にモンスターが1体ずつ', () => {
  expect(MONSTERS).toHaveLength(6);
  expect(MONSTERS.map(m => m.world).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  for (const m of MONSTERS) {
    expect(m.name.length).toBeGreaterThan(0);
    expect(m.color).toMatch(/^#[0-9a-f]{6}$/i);
  }
});

test('monsterFor: ステージのワールドに対応、不明なら安全にワールド1', () => {
  expect(monsterFor('w1-1').world).toBe(1);
  expect(monsterFor('w6-5').world).toBe(6);
  expect(monsterFor('存在しない').world).toBe(1);
});

test('isBossStage: 各ワールドの最終ステージだけがボス', () => {
  const bosses = STAGES.filter(s => isBossStage(s.id));
  expect(bosses).toHaveLength(6);
  // 各ワールドでそのワールド最後のステージであること
  for (const b of bosses) {
    const sameWorld = STAGES.filter(s => s.world === b.world);
    expect(sameWorld[sameWorld.length - 1].id).toBe(b.id);
  }
  expect(isBossStage('w1-1')).toBe(false);
});

test('bossWorldOf', () => {
  const boss = STAGES.filter(s => s.world === 1).slice(-1)[0];
  expect(bossWorldOf(boss.id)).toBe(1);
  expect(bossWorldOf('w1-1')).toBeNull();
  expect(bossWorldOf('存在しない')).toBeNull();
});

test('maxHpFor: 通常は2問、ボスは1問だけ余裕がある。最低1', () => {
  expect(maxHpFor(10, false)).toBe(8);
  expect(maxHpFor(10, true)).toBe(9);
  expect(maxHpFor(1, false)).toBe(1);
  expect(maxHpFor(0, true)).toBe(1);
});

test('damageFor: 不正解は0、コンボ3以上で2', () => {
  expect(damageFor(false, 99)).toBe(0);
  expect(damageFor(true, 0)).toBe(1);
  expect(damageFor(true, 2)).toBe(1);
  expect(damageFor(true, 3)).toBe(2);
});

test('全問正解なら通常モンスターもボスも倒せる（10問想定）', () => {
  let normal = 0, combo = 0;
  for (let i = 0; i < 10; i++) { normal += damageFor(true, combo); combo++; }
  expect(normal).toBeGreaterThanOrEqual(maxHpFor(10, true));
});

test('2問まちがえても通常モンスターは倒せる（連続正解が途切れる並びで検証）', () => {
  const results = [true, true, false, true, true, true, false, true, true, true];
  let hp = maxHpFor(10, false), combo = 0;
  for (const ok of results) {
    hp -= damageFor(ok, combo);
    combo = ok ? combo + 1 : 0;
  }
  expect(hp).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd math-quest && npm test`
Expected: FAIL（`@/lib/battle` not found）

- [ ] **Step 3: 実装**

`math-quest/lib/battle.ts`:

```ts
import { STAGES, stageById } from './stages';

export type MonsterShape = 'slime' | 'bat' | 'rock' | 'ghost' | 'fish' | 'dragon';
export type Monster = { world: number; name: string; color: string; shape: MonsterShape };

export const MONSTERS: Monster[] = [
  { world: 1, name: 'ククスライム', color: '#4ade80', shape: 'slime' },
  { world: 2, name: 'モリコウモリ', color: '#a78bfa', shape: 'bat' },
  { world: 3, name: 'イワゴーレム', color: '#94a3b8', shape: 'rock' },
  { world: 4, name: 'タニゴースト', color: '#38bdf8', shape: 'ghost' },
  { world: 5, name: 'ウミノヌシ', color: '#f472b6', shape: 'fish' },
  { world: 6, name: 'ブンスウドラゴン', color: '#fb7185', shape: 'dragon' },
];

export const BOSS_BONUS_COINS = 50;
export const MONSTER_BONUS_COINS = 30;

export function monsterFor(stageId: string): Monster {
  const world = stageById(stageId)?.world ?? 1;
  return MONSTERS.find(m => m.world === world) ?? MONSTERS[0];
}

export function isBossStage(stageId: string): boolean {
  const stage = stageById(stageId);
  if (!stage) return false;
  const sameWorld = STAGES.filter(s => s.world === stage.world);
  return sameWorld[sameWorld.length - 1].id === stageId;
}

export function bossWorldOf(stageId: string): number | null {
  if (!isBossStage(stageId)) return null;
  return stageById(stageId)!.world;
}

export function maxHpFor(totalQuestions: number, isBoss: boolean): number {
  return Math.max(1, totalQuestions - (isBoss ? 1 : 2));
}

export function damageFor(correct: boolean, combo: number): number {
  if (!correct) return 0;
  return combo >= 3 ? 2 : 1;
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `cd math-quest && npm test`
Expected: PASS（既存29件 + 新規7件 = 36件）、警告ゼロ

- [ ] **Step 5: Commit**

```bash
git add math-quest/lib/battle.ts math-quest/tests/battle.test.ts
git commit -m "math-quest: add monster catalog and battle damage rules"
```

---

### Task 2: モンスターSVGコンポーネント

**Files:**
- Create: `math-quest/components/Monster.tsx`
- Create: `math-quest/app/monster-preview/page.tsx`（確認用。Task 3 で削除する）

**Interfaces:**
- Consumes: `Monster`, `MONSTERS`（lib/battle）
- Produces: `<MonsterView monster={Monster} isBoss?={boolean} hurt?={boolean} defeated?={boolean} size?={number} />`
  - `isBoss` で一回り大きく、王冠つきで描く
  - `hurt` が true の間は赤くフラッシュ（CSSトランジション）
  - `defeated` が true なら半透明で倒れた向き（回転）
  - 既定 size=120（幅px）

- [ ] **Step 1: MonsterViewを実装**

`math-quest/components/Monster.tsx`:

```tsx
import type { Monster, MonsterShape } from '@/lib/battle';

const EYE = '#1a1440';

function Eyes({ y = 40 }: { y?: number }) {
  return (
    <g fill={EYE}>
      <circle cx="40" cy={y} r="5" />
      <circle cx="60" cy={y} r="5" />
    </g>
  );
}

function Body({ shape, color }: { shape: MonsterShape; color: string }) {
  if (shape === 'bat') return (
    <g fill={color}>
      <polygon points="20,30 6,20 8,44" />
      <polygon points="80,30 94,20 92,44" />
      <rect x="28" y="24" width="44" height="40" rx="14" />
      <polygon points="34,26 38,12 46,26" />
      <polygon points="66,26 62,12 54,26" />
    </g>
  );
  if (shape === 'rock') return (
    <g fill={color}>
      <polygon points="22,66 30,22 70,22 78,66" />
      <rect x="18" y="62" width="64" height="12" rx="4" />
    </g>
  );
  if (shape === 'ghost') return (
    <g fill={color}>
      <path d="M24 66 V40 a26 26 0 0 1 52 0 v26 l-9 -8 -8 8 -9 -8 -8 8 -9 -8 z" />
    </g>
  );
  if (shape === 'fish') return (
    <g fill={color}>
      <ellipse cx="52" cy="44" rx="30" ry="22" />
      <polygon points="22,44 6,30 6,58" />
      <polygon points="52,22 46,10 62,14" />
    </g>
  );
  if (shape === 'dragon') return (
    <g fill={color}>
      <rect x="26" y="26" width="48" height="38" rx="12" />
      <polygon points="30,26 24,8 42,20" />
      <polygon points="70,26 76,8 58,20" />
      <polygon points="74,52 96,60 74,66" />
    </g>
  );
  return (
    <g fill={color}>
      <path d="M20 66 a32 32 0 0 1 60 0 z" />
      <ellipse cx="50" cy="66" rx="30" ry="6" />
    </g>
  );
}

export default function MonsterView({
  monster, isBoss = false, hurt = false, defeated = false, size = 120,
}: {
  monster: Monster; isBoss?: boolean; hurt?: boolean; defeated?: boolean; size?: number;
}) {
  const eyeY = monster.shape === 'rock' ? 44 : monster.shape === 'fish' ? 40 : 42;
  return (
    <svg viewBox="0 0 100 80" width={size} height={size * 0.8}
      role="img" aria-label={`${isBoss ? 'ボス' : 'てき'}の${monster.name}`}
      style={{
        display: 'block',
        transition: 'transform 220ms ease, opacity 220ms ease, filter 160ms ease',
        transform: defeated ? 'rotate(90deg) scale(0.8)' : hurt ? 'translateX(4px)' : 'none',
        opacity: defeated ? 0.35 : 1,
        filter: hurt ? 'brightness(1.8) saturate(1.6)' : 'none',
      }}>
      {isBoss && (
        <polygon points="34,16 34,4 42,11 50,2 58,11 66,4 66,16" fill="#ffb703" />
      )}
      <g transform={isBoss ? 'translate(50,46) scale(1.12) translate(-50,-46)' : undefined}>
        <Body shape={monster.shape} color={monster.color} />
        <Eyes y={eyeY} />
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: 確認用ページを作る**

`math-quest/app/monster-preview/page.tsx`:

```tsx
import MonsterView from '@/components/Monster';
import { MONSTERS } from '@/lib/battle';

// 6体×（通常・ボス・ダメージ・撃破）の見え方を並べる（Task 3で削除）
export default function MonsterPreview() {
  const states = [
    { label: '通常', props: {} },
    { label: 'ボス', props: { isBoss: true } },
    { label: 'ダメージ', props: { hurt: true } },
    { label: '撃破', props: { defeated: true } },
  ];
  return (
    <main>
      <h1 style={{ margin: '12px 0' }}>モンスター確認</h1>
      {MONSTERS.map(m => (
        <section key={m.world} style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: '1rem', color: 'var(--accent)' }}>
            ワールド{m.world} {m.name}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {states.map(s => (
              <div key={s.label} className="card" style={{ textAlign: 'center', padding: 6 }}>
                <MonsterView monster={m} size={70} {...s.props} />
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 3: 型チェックとテスト**

Run: `cd math-quest && npx tsc --noEmit && npm test`
Expected: エラーなし、36件パス

- [ ] **Step 4: ブラウザで見た目を確認**

preview_start（`math-quest`）でモバイル 375×812、`/monster-preview` を開く。確認する点：

- 6体すべてが viewBox 内に収まっていて、体の一部が切れていないこと
- ボスの王冠が上端で切れていないこと、体と重なりすぎていないこと
- 「ダメージ」が赤く光って見えること、「撃破」が倒れて薄くなっていること
- 6体が見た目で区別できること（同じ形に見えないこと）
- スクリーンショットを撮る。おかしいものは座標を直して再確認する
- read_console_messages にエラーがないこと

- [ ] **Step 5: Commit**

```bash
git add math-quest/components/Monster.tsx math-quest/app/monster-preview
git commit -m "math-quest: add monster SVG component"
```

---

### Task 3: クイズ画面にバトルを組み込む

**Files:**
- Modify: `math-quest/components/QuizRunner.tsx`
- Delete: `math-quest/app/monster-preview/`

**Interfaces:**
- Consumes: `monsterFor`, `isBossStage`, `maxHpFor`, `damageFor`, `MONSTER_BONUS_COINS`, `BOSS_BONUS_COINS`（lib/battle）、`<MonsterView />`
- Produces: `QuizRunner` の `onFinish` の引数が
  `{ correctCount: number; total: number; defeated: boolean; bonusCoins: number }` に拡張される
  （`defeated` = モンスターのHPを0にできたか、`bonusCoins` = 撃破ボーナス。倒せなければ0）
- 表示仕様:
  - 問題カードの上にモンスターとHPバーを出す。HPバーは幅のCSSトランジションで減る
  - 正解時にモンスターが赤く光る（`hurt` を600ms）
  - HPが0になったら `defeated` 表示に切り替え、「たおした！ +Nコイン」を出す。**残りの問題はそのまま最後まで続ける**（途中で終わらせない。学習量を減らさないため）
  - ボスステージでは「ボスバトル！」の見出しとボス表示にする
- **既存の出題・採点・コイン計算・`correctRef`/`timerRef` のロジックは変更しない**

- [ ] **Step 1: QuizRunnerを変更**

`math-quest/components/QuizRunner.tsx` の import に追加:

```tsx
import MonsterView from './Monster';
import {
  monsterFor, isBossStage, maxHpFor, damageFor,
  MONSTER_BONUS_COINS, BOSS_BONUS_COINS,
} from '@/lib/battle';
```

`onFinish` の型を変更:

```tsx
  onFinish: (r: { correctCount: number; total: number; defeated: boolean; bonusCoins: number }) => void;
```

state 宣言のすぐ下（`const item = items[i];` の前）に追加:

```tsx
  const boss = isBossStage(stageId);
  const monster = monsterFor(stageId);
  const maxHp = maxHpFor(items.length, boss);
  const [hp, setHp] = useState(maxHp);
  const [hurt, setHurt] = useState(false);
  // 撃破判定はrefでも持つ（setTimeout内のnextが古いstateを読むのを防ぐ）
  const defeatedRef = useRef(false);
  const hurtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

アンマウント時のクリーンアップを差し替え:

```tsx
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (hurtTimerRef.current) clearTimeout(hurtTimerRef.current);
  }, []);
```

`next` の `onFinish` 呼び出しを差し替え:

```tsx
      onFinish({
        correctCount: correctRef.current, total: items.length,
        defeated: defeatedRef.current,
        bonusCoins: defeatedRef.current ? (boss ? BOSS_BONUS_COINS : MONSTER_BONUS_COINS) : 0,
      });
```

`submit` の中、`if (correct) correctRef.current += 1;` の直後に追加:

```tsx
    if (correct) {
      const dmg = damageFor(true, combo);
      setHp(prev => {
        const nextHp = Math.max(0, prev - dmg);
        if (nextHp === 0) defeatedRef.current = true;
        return nextHp;
      });
      setHurt(true);
      hurtTimerRef.current = setTimeout(() => setHurt(false), 600);
    }
```

進捗行のすぐ下（問題カードの前）にバトル表示を追加:

```tsx
      <div className="card" style={{ textAlign: 'center', padding: 8 }}>
        {boss && (
          <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: 4 }}>
            ボスバトル！
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <MonsterView monster={monster} isBoss={boss} hurt={hurt}
            defeated={hp === 0} size={boss ? 130 : 110} />
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '4px 0' }}>
          {monster.name}
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: 999, height: 12, overflow: 'hidden' }}>
          <div style={{
            width: `${(hp / maxHp) * 100}%`, height: '100%',
            background: hp / maxHp > 0.3 ? 'var(--good)' : 'var(--bad)',
            transition: 'width 300ms ease',
          }} />
        </div>
        {hp === 0 && (
          <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginTop: 6 }}>
            たおした！ +{boss ? BOSS_BONUS_COINS : MONSTER_BONUS_COINS}コイン
          </div>
        )}
      </div>
```

- [ ] **Step 2: 呼び出し側の型を合わせる**

`math-quest/app/quiz/[stageId]/page.tsx` の `finish` を差し替える（★の計算とAPI呼び出しは維持し、撃破ボーナスの表示と加算を足す）:

```tsx
  const [result, setResult] = useState<
    { correctCount: number; total: number; defeated: boolean; bonusCoins: number } | null
  >(null);

  const finish = async (r: { correctCount: number; total: number; defeated: boolean; bonusCoins: number }) => {
    setResult(r);
    const stars = starsFor(r.correctCount, r.total);
    if (r.bonusCoins > 0) {
      await fetch('/api/answer', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ correct: true, coins: r.bonusCoins }),
      }).catch(() => {});
    }
    if (isMission) await fetch('/api/mission-complete', { method: 'POST' }).catch(() => {});
    else await fetch('/api/stage-clear', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stageId: realStage, stars, defeated: r.defeated }),
    }).catch(() => {});
  };
```

結果画面に撃破の表示を足す（`{result.total}問中 …` の行の下に挿入）:

```tsx
          {result.defeated && (
            <p style={{ color: 'var(--accent)' }}>モンスターをたおした！ +{result.bonusCoins}コイン</p>
          )}
```

- [ ] **Step 3: 確認用ページを削除**

```bash
rm -rf math-quest/app/monster-preview
```

- [ ] **Step 4: 型チェックとテスト**

Run: `cd math-quest && npx tsc --noEmit && npm test`
Expected: エラーなし、36件パス

- [ ] **Step 5: ブラウザで通し確認**

ローカルDBとpreviewを起動（`docker start mathquest-pg mathquest-proxy`）、モバイル 375×812。合い言葉は `kitsune-udon-123`。

1. `/quiz/w1-1` を10問通す。正解のたびにHPバーが減り、モンスターが赤く光ること
2. 全問正解に近い流れでHPが0になり、「たおした！ +30コイン」が出て、モンスターが倒れた見た目になること。**その後も残りの問題が続くこと**
3. 結果画面に「モンスターをたおした！」が出ること
4. わざと多く間違えて倒せなかった場合、撃破表示が出ず、★とクリア自体は普通に成立すること
5. ボスステージ `/quiz/w1-6` で「ボスバトル！」と王冠つきの大きい敵が出ること
6. `docker exec mathquest-pg psql -U mathquest -d mathquest -c "select coins from player;"` でボーナス分が加算されていること
7. read_console_messages にエラーがないこと。スクリーンショットを撮る

- [ ] **Step 6: Commit**

```bash
git add math-quest/components/QuizRunner.tsx math-quest/app/quiz
git commit -m "math-quest: add monster HP battle layer to quiz"
```

---

### Task 4: ボス撃破の記録とレアアイテム解放

**Files:**
- Create: `math-quest/db/migrations/003-boss.sql`
- Modify: `math-quest/db/schema.sql`
- Modify: `math-quest/app/api/stage-clear/route.ts`
- Modify: `math-quest/app/api/state/route.ts`
- Modify: `math-quest/app/api/shop/route.ts`
- Modify: `math-quest/lib/avatar.ts`
- Modify: `math-quest/app/shop/page.tsx`
- Test: `math-quest/tests/avatar.test.ts`（追記）

**Interfaces:**
- Consumes: `bossWorldOf`（lib/battle）
- Produces:
  - player に `defeated_bosses int[] not null default '{}'`
  - `Unlock` に `{ kind: 'boss'; world: number }` を追加
  - `PlayerStats` に `defeatedBosses: number[]` を追加
  - `POST /api/stage-clear` が body の `defeated` を受け取り、ボスステージかつ `defeated === true` のとき `defeated_bosses` にワールド番号を重複なく追加する
  - `GET /api/state` が `defeatedBosses: number[]` を返す
  - 王冠を「14日連続」から「ワールド1のボス撃破」に変更（設計書どおりのボス解放を1つ実装する）

- [ ] **Step 1: avatar のテストを追記して失敗させる**

`math-quest/tests/avatar.test.ts` の末尾に追加:

```ts
test('boss解放: ボスを倒すまでロック', () => {
  const bossItem = ITEMS.find(i => i.unlock?.kind === 'boss')!;
  expect(bossItem).toBeDefined();
  const world = (bossItem.unlock as { kind: 'boss'; world: number }).world;
  expect(isUnlocked(bossItem, { totalStars: 999, streak: 999, defeatedBosses: [] })).toBe(false);
  expect(isUnlocked(bossItem, { totalStars: 0, streak: 0, defeatedBosses: [world] })).toBe(true);
  expect(unlockLabel(bossItem)).toContain('ボス');
});

test('既存の解放条件は defeatedBosses があっても壊れない', () => {
  const starItem = ITEMS.find(i => i.unlock?.kind === 'stars')!;
  const need = (starItem.unlock as { kind: 'stars'; count: number }).count;
  expect(isUnlocked(starItem, { totalStars: need, streak: 0, defeatedBosses: [] })).toBe(true);
});
```

`tests/avatar.test.ts` の既存テストは `PlayerStats` に `defeatedBosses` が増えるため型エラーになる。既存の `{ totalStars: X, streak: Y }` を渡している箇所すべてに `defeatedBosses: []` を足すこと。

- [ ] **Step 2: 失敗を確認**

Run: `cd math-quest && npm test`
Expected: FAIL（boss解放のアイテムが無い / 型エラー）

- [ ] **Step 3: lib/avatar.ts を変更**

型を差し替える:

```ts
export type Unlock =
  | { kind: 'stars'; count: number }
  | { kind: 'streak'; days: number }
  | { kind: 'boss'; world: number };
export type PlayerStats = { totalStars: number; streak: number; defeatedBosses: number[] };
```

王冠の定義を差し替える（idと価格と名前は変えない）:

```ts
  { id: 'hat-crown', slot: 'hat', name: '王冠', price: 500, shape: 'crown', color: '#ffb703',
    unlock: { kind: 'boss', world: 1 } },
```

`isUnlocked` と `unlockLabel` を差し替える:

```ts
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
```

- [ ] **Step 4: テスト成功を確認**

Run: `cd math-quest && npm test`
Expected: PASS（38件）

- [ ] **Step 5: マイグレーションとAPI**

`math-quest/db/migrations/003-boss.sql`:

```sql
alter table player add column if not exists defeated_bosses int[] not null default '{}';
```

`math-quest/db/schema.sql` の player 定義に1行追加（`equipped` の次）:

```sql
  defeated_bosses int[] not null default '{}',
```

`math-quest/app/api/stage-clear/route.ts` — import に `bossWorldOf` を足し、`nextStage` を返す直前にボス記録を追加:

```ts
import { bossWorldOf } from '@/lib/battle';
```

```ts
  // ボスを倒したワールドを重複なく記録する
  const bossWorld = bossWorldOf(stageId);
  if (bossWorld !== null && defeated === true) {
    await sql`update player
      set defeated_bosses = array_append(defeated_bosses, ${bossWorld})
      where id = ${pid} and not (${bossWorld} = any(defeated_bosses))`;
  }
```

`defeated` は body から取り出す（`const { stageId, stars, defeated } = await req.json().catch(() => ({}));`）。

`math-quest/app/api/state/route.ts` — select に `defeated_bosses` を足し、返り値に追加:

```ts
    defeatedBosses: player.defeated_bosses ?? [],
```

`math-quest/app/api/shop/route.ts` — player の select に `defeated_bosses` を足し、`canBuy` に渡す stats を差し替える:

```ts
  const check = canBuy(itemId, player.coins, owned, {
    totalStars: starRow.total, streak: player.streak,
    defeatedBosses: player.defeated_bosses ?? [],
  });
```

`math-quest/app/shop/page.tsx` — `State` に `defeatedBosses: number[]` を足し、`stats` を差し替える:

```tsx
  const stats = {
    totalStars: state.totalStars, streak: state.streak,
    defeatedBosses: state.defeatedBosses ?? [],
  };
```

- [ ] **Step 6: ローカルで確認**

```bash
docker start mathquest-pg mathquest-proxy
docker exec -i mathquest-pg psql -U mathquest -d mathquest < math-quest/db/migrations/003-boss.sql
docker exec mathquest-pg psql -U mathquest -d mathquest -c "\d player"
```

Expected: `defeated_bosses` が列一覧にある

Run: `cd math-quest && npx tsc --noEmit && npm test` → エラーなし、38件パス

ブラウザ（モバイル）で:
1. `/shop` の王冠が「🔒 ワールド1のボスを倒すと買えるよ」になっていること
2. ボスステージ `/quiz/w1-6` を通してモンスターを倒す
3. `docker exec mathquest-pg psql -U mathquest -d mathquest -c "select defeated_bosses from player;"` に `{1}` が入ること
4. `/shop` に戻ると王冠のロックが外れ、コインが足りれば買えること
5. 同じボスをもう一度倒しても `defeated_bosses` が `{1,1}` にならないこと
6. read_console_messages にエラーがないこと

- [ ] **Step 7: Commit**

```bash
git add math-quest/db math-quest/lib math-quest/app math-quest/tests
git commit -m "math-quest: record boss defeats and gate the crown behind world 1 boss"
```

---

### Task 5: 本番反映

**Files:** なし（マイグレーション適用とデプロイのみ）

**Interfaces:**
- Consumes: Task 1〜4 の成果物
- Produces: 本番 https://math-quest-lemon-five.vercel.app にバトルとボスが反映された状態

- [ ] **Step 1: 本番DBにマイグレーションを当てる**

`math-quest/` で作業する。**接続文字列を標準出力に出さないこと。** コメント行を先に落としてから分割する（これを逆にすると文が消える）。

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
const [before] = await sql`select (select count(*) from player)::int as player,
  (select count(*) from progress)::int as progress`;
console.log('before:', JSON.stringify(before));
const raw = fs.readFileSync('db/migrations/003-boss.sql','utf8')
  .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const stmts = raw.split(';').map(s => s.trim()).filter(Boolean);
console.log('statements to run:', stmts.length); // 期待値: 1
for (const s of stmts) { await sql.query(s); console.log('OK:', s.slice(0, 60)); }
const cols = await sql`select column_name from information_schema.columns
  where table_name = 'player' order by column_name`;
console.log('player columns:', cols.map(c => c.column_name).join(', '));
const [after] = await sql`select (select count(*) from player)::int as player,
  (select count(*) from progress)::int as progress`;
console.log('after:', JSON.stringify(after));
EOF
node ./tmp-migrate.mjs "$TMP"
rm -f ./tmp-migrate.mjs "$TMP"
```

Expected: `statements to run: 1`、`defeated_bosses` が列一覧に含まれ、before と after の件数が一致

- [ ] **Step 2: 本番デプロイ**

```bash
cd math-quest && npx vercel deploy --prod
```

- [ ] **Step 3: 本番で確認**

**本番のプレイヤーデータはお子さんのものなので、ログインしたりデータを書き換えたりしない。** 確認するのは次だけ:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://math-quest-lemon-five.vercel.app/login
curl -s -o /dev/null -w "%{http_code}\n" https://math-quest-lemon-five.vercel.app/api/state
```

Expected: `/login` が 200、`/api/state` が 401（未ログインなので正しい）

ブラウザで `/login` を開いてスクリーンショットを撮り、read_console_messages にエラーがないことを確認する。

- [ ] **Step 4: push**

```bash
git push origin math-quest-core
```

---

## この計画に含めないもの（次の計画）

- タイムアタック（60秒・自己ベスト）
- 保護者ページ（正答率推移・苦手分野ランキング）
- オフライン時の解答キュー
- 難易度の自動調整
- ワールド2〜6のボス撃破に紐づくレアアイテム（今回は王冠＝ワールド1のみ。仕組みは `{ kind: 'boss', world }` で拡張可能）
