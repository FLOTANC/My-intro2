import MonsterView from '@/components/Monster';
import { MONSTERS } from '@/lib/battle';

// 6体×（通常・ボス・ダメージ・撃破）の見え方を並べる（Task 3で削除）
export default function MonsterPreview() {
  const states = [
    { label: '通常', props: {} },
    { label: 'ボス', props: { isBoss: true } },
    { label: 'ダメージ', props: { hurt: true } },
    { label: '撃破', props: { defeated: true } },
  ];
  return (
    <main>
      <h1 style={{ margin: '12px 0' }}>モンスター確認</h1>
      {MONSTERS.map(m => (
        <section key={m.world} style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: '1rem', color: 'var(--accent)' }}>
            ワールド{m.world} {m.name}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {states.map(s => (
              <div key={s.label} className="card" style={{ textAlign: 'center', padding: 6 }}>
                <MonsterView monster={m} size={70} {...s.props} />
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
