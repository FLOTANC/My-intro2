'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Problem, AnswerInput } from '@/lib/types';
import { checkAnswer, problemText, correctText, explainLines } from '@/lib/check';
import { coinsFor } from '@/lib/scoring';
import { buildMission } from '@/lib/mission';
import AnswerForm from './AnswerForm';
import Avatar from './Avatar';
import type { Equipped } from '@/lib/avatar';
import MonsterView from './Monster';
import {
  monsterFor, isBossStage, maxHpFor, damageFor,
  MONSTER_BONUS_COINS, BOSS_BONUS_COINS,
} from '@/lib/battle';

type Item = { problem: Problem; isReview: boolean; mistakeId?: number };
type Phase = { name: 'ask' } | { name: 'correct'; coins: number } | { name: 'wrong' } | { name: 'done' };

export default function QuizRunner({ stageId, reviews, equipped, onFinish }: {
  stageId: string;
  reviews: { id: number; problem: Problem }[];
  equipped: Equipped;
  onFinish: (r: { correctCount: number; total: number; defeated: boolean; bonusCoins: number }) => void;
}) {
  const items: Item[] = useMemo(() => {
    const m = buildMission(reviews.map(r => r.problem), stageId);
    return m.map((x, i) => ({ ...x, mistakeId: x.isReview ? reviews[i]?.id : undefined }));
  }, [stageId, reviews]);

  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: 'ask' });
  const [combo, setCombo] = useState(0);
  const [startMs, setStartMs] = useState(Date.now());
  // 正解数はrefで持つ（setTimeout内のnextがstateの古い値を読むのを防ぐ）
  const correctRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boss = isBossStage(stageId);
  const monster = monsterFor(stageId);
  const maxHp = maxHpFor(items.length, boss);
  const [hp, setHp] = useState(maxHp);
  const [hurt, setHurt] = useState(false);
  // 撃破判定はrefでも持つ（setTimeout内のnextが古いstateを読むのを防ぐ）
  const defeatedRef = useRef(false);
  const hurtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const item = items[i];

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (hurtTimerRef.current) clearTimeout(hurtTimerRef.current);
  }, []);

  const next = () => {
    if (i + 1 >= items.length) {
      setPhase({ name: 'done' });
      onFinish({
        correctCount: correctRef.current, total: items.length,
        defeated: defeatedRef.current,
        bonusCoins: defeatedRef.current ? (boss ? BOSS_BONUS_COINS : MONSTER_BONUS_COINS) : 0,
      });
      return;
    }
    setI(i + 1); setPhase({ name: 'ask' }); setStartMs(Date.now());
  };

  const submit = (input: AnswerInput) => {
    const correct = checkAnswer(item.problem, input);
    const coins = coinsFor(correct, Date.now() - startMs, combo);
    setPhase(correct ? { name: 'correct', coins } : { name: 'wrong' });
    setCombo(correct ? combo + 1 : 0);
    if (correct) correctRef.current += 1;
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
    fetch('/api/answer', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        problem: item.problem, correct, coins,
        wrongAnswer: input.value ?? `${input.q ?? input.n ?? ''}/${input.r ?? input.d ?? ''}`,
        mistakeId: item.mistakeId,
      }),
    }).catch(() => {});
    if (correct) timerRef.current = setTimeout(next, 1000);
  };

  if (!item || phase.name === 'done') return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--muted)' }}>
        <Avatar equipped={equipped} size={32} />
        <span>{i + 1} / {items.length} 問目</span>
        {combo >= 2 && <span style={{ color: 'var(--accent)' }}>🔥 {combo} コンボ</span>}
        {item.isReview && <span>復習</span>}
      </div>
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
      <div className="card" style={{ textAlign: 'center', fontSize: '2.2rem', fontWeight: 'bold', margin: '12px 0' }}>
        {problemText(item.problem)} = ?
      </div>

      {phase.name === 'ask' && <AnswerForm key={i} problem={item.problem} onSubmit={submit} />}

      {phase.name === 'correct' && (
        <div className="card" style={{ textAlign: 'center', background: 'var(--good)', color: '#1a1440' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>正解！</div>
          <div>+{phase.coins} コイン</div>
        </div>
      )}

      {phase.name === 'wrong' && (
        <div className="card">
          <div style={{ color: 'var(--bad)', fontWeight: 'bold', marginBottom: 8 }}>
            残念… 答えは {correctText(item.problem)}
          </div>
          {explainLines(item.problem).map((l, j) => (
            <p key={j} style={{ margin: '4px 0', color: 'var(--muted)' }}>{l}</p>
          ))}
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={next}>わかった！</button>
        </div>
      )}
    </div>
  );
}
