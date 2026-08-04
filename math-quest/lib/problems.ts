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
  'w4-1': () => divExact(2, 9, 11, 99), 'w4-2': () => divExact(2, 9, 101, 999),
  'w4-3': () => divmod(3, 9, 11, 99), 'w4-4': () => divExact(11, 19, 11, 99),
  'w4-5': () => pick([() => divExact(2, 9, 11, 99), () => divmod(3, 9, 11, 99), () => divExact(11, 19, 11, 99)])(),
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
