'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Problem, AnswerInput } from '@/lib/types';
import { checkAnswer, problemText, correctText, explainLines } from '@/lib/check';
import AnswerForm from '@/components/AnswerForm';

type Entry = { id: number; problem: Problem; wrongAnswer: string };

export default function NotebookPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [graduated, setGraduated] = useState(0);
  const [solving, setSolving] = useState<Entry | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const router = useRouter();

  const load = () => fetch('/api/mistakes').then(r => r.json()).then(d => {
    if (d.ok) { setEntries(d.active); setGraduated(d.graduatedCount); } else { router.replace('/login'); }
  }).catch(() => router.replace('/login'));
  useEffect(() => { load(); }, [router]);

  const submit = async (input: AnswerInput) => {
    if (!solving) return;
    const correct = checkAnswer(solving.problem, input);
    setFeedback(correct ? 'correct' : 'wrong');
    await fetch('/api/answer', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ problem: solving.problem, correct, coins: correct ? 10 : 0, mistakeId: solving.id }),
    }).catch(() => {});
  };

  const closeSolve = () => { setSolving(null); setFeedback(null); load(); };

  if (solving) {
    return (
      <main>
        <h1 style={{ margin: '8px 0 16px' }}>といなおし</h1>
        <div className="card" style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 'bold', marginBottom: 12 }}>
          {problemText(solving.problem)} = ?
        </div>
        {!feedback && <AnswerForm problem={solving.problem} onSubmit={submit} />}
        {feedback === 'correct' && (
          <div className="card" style={{ background: 'var(--good)', color: '#1a1440', textAlign: 'center' }}>
            <p style={{ fontWeight: 'bold', fontSize: '1.4rem' }}>せいかい！ +10コイン</p>
            <button className="btn-primary" style={{ marginTop: 8 }} onClick={closeSolve}>もどる</button>
          </div>
        )}
        {feedback === 'wrong' && (
          <div className="card">
            <p style={{ color: 'var(--bad)', fontWeight: 'bold' }}>こたえは {correctText(solving.problem)}</p>
            {explainLines(solving.problem).map((l, i) => <p key={i} style={{ color: 'var(--muted)', margin: '4px 0' }}>{l}</p>)}
            <button className="btn-primary" style={{ marginTop: 8 }} onClick={closeSolve}>もどる</button>
          </div>
        )}
      </main>
    );
  }

  return (
    <main>
      <Link href="/" style={{ color: 'var(--muted)' }}>← ホーム</Link>
      <h1 style={{ margin: '12px 0' }}>まちがいノート</h1>
      <p style={{ color: 'var(--accent)', marginBottom: 12 }}>🎓 そつぎょうした問題: {graduated}こ</p>
      {entries.length === 0 && <p className="card">いまは にがてな問題は ないよ！すごい！</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(e => (
          <div key={e.id} className="card">
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>{problemText(e.problem)}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '4px 0' }}>
              まえのこたえ: {e.wrongAnswer || '（むかいとう）'} ／ せいかい: {correctText(e.problem)}
            </div>
            <button className="btn-primary" style={{ minHeight: 44, fontSize: '1rem' }}
              onClick={() => setSolving(e)}>といなおす</button>
          </div>
        ))}
      </div>
    </main>
  );
}
