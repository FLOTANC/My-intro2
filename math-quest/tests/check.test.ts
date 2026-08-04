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
