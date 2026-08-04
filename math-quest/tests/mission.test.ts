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
