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
