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
