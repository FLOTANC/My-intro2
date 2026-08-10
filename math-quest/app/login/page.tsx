'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async () => {
    if (busy || code.trim().length < 3) return; // 二重送信と空送信を防ぐ
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const d = await r.json();
      if (d.ok) router.push('/');
      else setError(d.error ?? 'あいことばがちがうみたい');
    } catch {
      setError('でんぱがよわいみたい。もういちどためしてね');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
      <h1 style={{ textAlign: 'center' }}>さんすうクエスト</h1>
      <p style={{ textAlign: 'center', color: 'var(--muted)' }}>あいことばを いれてね</p>
      <input
        value={code} onChange={e => setCode(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        style={{ fontSize: '1.4rem', padding: 12, borderRadius: 16, border: 'none', textAlign: 'center' }}
        placeholder="あいことば"
      />
      {error && <p style={{ color: 'var(--bad)', textAlign: 'center' }}>{error}</p>}
      <button className="btn-primary" onClick={submit} disabled={busy || code.trim().length < 3}
        style={{ opacity: busy || code.trim().length < 3 ? 0.5 : 1 }}>
        {busy ? 'まってね…' : 'はじめる'}
      </button>
    </main>
  );
}
