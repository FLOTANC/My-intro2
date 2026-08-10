'use client';

export default function Keypad({ keys, onKey }: { keys: string[]; onKey: (k: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {keys.map(k => (
        <button
          key={k}
          onClick={() => onKey(k)}
          style={{
            minHeight: 56, fontSize: '1.5rem', fontWeight: 'bold',
            background: k === 'OK' ? 'var(--good)' : 'var(--card)',
            color: k === 'OK' ? '#1a1440' : 'var(--text)',
            // 3の倍数でないときだけOKを最終行いっぱいに広げる（すきま防止）
            gridColumn: k === 'OK' && keys.length % 3 !== 0 ? '1 / -1' : undefined,
          }}
        >
          {k === '←' ? '⌫' : k}
        </button>
      ))}
    </div>
  );
}
