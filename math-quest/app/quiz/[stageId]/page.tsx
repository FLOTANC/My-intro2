'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QuizRunner from '@/components/QuizRunner';
import { stageById } from '@/lib/stages';
import type { Problem } from '@/lib/types';
import { DEFAULT_EQUIPPED, type Equipped } from '@/lib/avatar';

type State = {
  currentStage: string;
  reviewProblems: { id: number; problem: Problem }[];
  equipped?: Equipped;
};

const starsFor = (correctCount: number, total: number) =>
  correctCount === total ? 3 : correctCount / total >= 0.8 ? 2 : 1;

export default function QuizPage({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = use(params);
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [result, setResult] = useState<{ correctCount: number; total: number } | null>(null);
  const isMission = stageId === 'mission';

  useEffect(() => {
    fetch('/api/state').then(r => r.json()).then(d => {
      if (!d.ok) { router.replace('/login'); return; }
      setState(d);
    }).catch(() => setState({ currentStage: 'w1-1', reviewProblems: [], equipped: DEFAULT_EQUIPPED }));
  }, [router]);

  if (!state) return <main><p>準備中…</p></main>;

  const realStage = isMission ? state.currentStage : stageId;
  if (!stageById(realStage)) return <main><p>そのステージは無いみたい</p></main>;

  const finish = async (r: { correctCount: number; total: number }) => {
    setResult(r);
    const stars = starsFor(r.correctCount, r.total);
    if (isMission) await fetch('/api/mission-complete', { method: 'POST' }).catch(() => {});
    else await fetch('/api/stage-clear', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stageId: realStage, stars }),
    }).catch(() => {});
  };

  return (
    <main>
      <h1 style={{ fontSize: '1.1rem', margin: '8px 0 16px' }}>
        {isMission ? '今日のミッション' : stageById(realStage)!.title}
      </h1>
      {!result && (
        <QuizRunner stageId={realStage} equipped={state.equipped ?? DEFAULT_EQUIPPED}
          reviews={isMission ? state.reviewProblems : []} onFinish={finish} />
      )}
      {result && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>
            {'★'.repeat(starsFor(result.correctCount, result.total))}
          </div>
          <p style={{ margin: '8px 0' }}>{result.total}問中 {result.correctCount}問 正解！</p>
          <button className="btn-primary" onClick={() => router.push('/')}>ホームへ</button>
        </div>
      )}
    </main>
  );
}
