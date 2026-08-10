'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QuizRunner from '@/components/QuizRunner';
import { stageById } from '@/lib/stages';
import type { Problem } from '@/lib/types';

type State = { currentStage: string; reviewProblems: { id: number; problem: Problem }[] };

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
    }).catch(() => setState({ currentStage: 'w1-1', reviewProblems: [] }));
  }, [router]);

  if (!state) return <main><p>じゅんびちゅう…</p></main>;

  const realStage = isMission ? state.currentStage : stageId;
  if (!stageById(realStage)) return <main><p>そのステージはないみたい</p></main>;

  const finish = async (r: { correctCount: number; total: number }) => {
    setResult(r);
    const stars = r.correctCount === r.total ? 3 : r.correctCount / r.total >= 0.8 ? 2 : 1;
    if (isMission) await fetch('/api/mission-complete', { method: 'POST' }).catch(() => {});
    else await fetch('/api/stage-clear', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stageId: realStage, stars }),
    }).catch(() => {});
  };

  return (
    <main>
      <h1 style={{ fontSize: '1.1rem', margin: '8px 0 16px' }}>
        {isMission ? 'きょうのミッション' : stageById(realStage)!.title}
      </h1>
      {!result && (
        <QuizRunner stageId={realStage}
          reviews={isMission ? state.reviewProblems : []} onFinish={finish} />
      )}
      {result && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>
            {'★'.repeat(result.correctCount === result.total ? 3 : result.correctCount / result.total >= 0.8 ? 2 : 1)}
          </div>
          <p style={{ margin: '8px 0' }}>{result.total}もん中 {result.correctCount}もん せいかい！</p>
          <button className="btn-primary" onClick={() => router.push('/')}>ホームへ</button>
        </div>
      )}
    </main>
  );
}
