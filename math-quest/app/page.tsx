'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { stageById, STAGES } from '@/lib/stages';

type State = {
  ok: boolean; coins: number; streak: number; currentStage: string;
  missionDoneToday: boolean; reviewProblems: unknown[];
};

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/state').then(r => r.json()).then(d => {
      if (!d.ok) router.replace('/login'); else setState(d);
    }).catch(() => router.replace('/login'));
  }, [router]);

  if (!state) return <main><p>準備中…</p></main>;

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
        <span>🔥 {state.streak}日連続</span>
        <span>🪙 {state.coins}</span>
      </header>

      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '4rem' }}>🐣</div>
        <p style={{ color: 'var(--muted)' }}>（アバターはこれから育つよ）</p>
      </div>

      <Link href="/quiz/mission">
        <button className="btn-primary">
          {state.missionDoneToday ? '今日のミッション クリア済み！もう一回？' : '今日のミッションを始める！'}
        </button>
      </Link>

      <Link href="/map">
        <button className="btn-primary" style={{ background: 'var(--card)', color: 'var(--text)' }}>
          冒険マップ（今: {stageById(state.currentStage)?.title ?? STAGES[0].title}）
        </button>
      </Link>

      <Link href="/notebook">
        <button className="btn-primary" style={{ background: 'var(--card)', color: 'var(--text)' }}>
          間違いノート
        </button>
      </Link>
    </main>
  );
}
