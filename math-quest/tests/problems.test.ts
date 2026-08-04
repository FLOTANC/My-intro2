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

test('kuku stages stay within their dan', () => {
  for (let i = 0; i < 50; i++) {
    const p = generateProblem('w1-1');
    if (p.kind !== 'mul') throw new Error('expected mul');
    expect([2, 3]).toContain(p.a);
    expect(p.b).toBeGreaterThanOrEqual(2); expect(p.b).toBeLessThanOrEqual(9);
  }
});
