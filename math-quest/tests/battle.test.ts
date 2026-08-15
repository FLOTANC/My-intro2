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
