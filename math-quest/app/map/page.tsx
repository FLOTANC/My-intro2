'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { STAGES, WORLDS } from '@/lib/stages';

type State = { ok: boolean; currentStage: string; clearedStages: { stageId: string; stars: number }[] };

export default function MapPage() {
  const [state, setState] = useState<State | null>(null);
  const router = useRouter();
  useEffect(() => {
    fetch('/api/state').then(r => r.json()).then(d => {
      if (!d.ok) router.replace('/login'); else setState(d);
    }).catch(() => router.replace('/login'));
  }, [router]);
  if (!state) return <main><p>準備中…</p></main>;

  const stars = new Map(state.clearedStages.map(c => [c.stageId, c.stars]));
  // 未知のステージIDでも全ロックにならないよう最低0に丸める
  const currentIdx = Math.max(STAGES.findIndex(s => s.id === state.currentStage), 0);

  return (
    <main>
      <Link href="/" style={{ color: 'var(--muted)' }}>← ホーム</Link>
      <h1 style={{ margin: '12px 0' }}>冒険マップ</h1>
      {WORLDS.map(w => (
        <section key={w.id} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: 8 }}>
            ワールド{w.id} {w.title}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {STAGES.filter(s => s.world === w.id).map(s => {
              const idx = STAGES.findIndex(x => x.id === s.id);
              const locked = idx > currentIdx;
              const st = stars.get(s.id);
              return (
                <Link key={s.id} href={locked ? '#' : `/quiz/${s.id}`}
                  style={{ pointerEvents: locked ? 'none' : 'auto', textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{ display: 'flex', justifyContent: 'space-between', opacity: locked ? 0.4 : 1 }}>
                    <span>{locked ? '🔒' : st ? '✅' : '▶️'} {s.title}</span>
                    <span style={{ color: 'var(--accent)' }}>{st ? '★'.repeat(st) : ''}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
