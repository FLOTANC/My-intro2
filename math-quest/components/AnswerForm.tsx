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
