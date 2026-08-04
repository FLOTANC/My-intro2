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
