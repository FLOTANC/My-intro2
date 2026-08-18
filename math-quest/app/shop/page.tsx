'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import {
  ITEMS, ITEM_BY_ID, SLOTS, SLOT_LABEL, isOwned, isUnlocked, unlockLabel,
  DEFAULT_EQUIPPED, type Equipped, type Slot,
} from '@/lib/avatar';

type State = {
  ok: boolean; coins: number; streak: number; totalStars: number;
  ownedItems: string[]; equipped?: Equipped; defeatedBosses: number[];
};

export default function ShopPage() {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/state').then(r => r.json()).then(d => {
      if (!d.ok) { router.replace('/login'); return; }
      setState(d);
    }).catch(() => router.replace('/login'));
  }, [router]);

  if (!state) return <main><p>準備中…</p></main>;

  const stats = {
    totalStars: state.totalStars, streak: state.streak,
    defeatedBosses: state.defeatedBosses ?? [],
  };
  // 古い /api/state レスポンスでも落ちないようデフォルトに退避する
  const equipped = state.equipped ?? DEFAULT_EQUIPPED;

  // setState は必ず関数形で更新する。buy の直後に doEquip を呼ぶため、
  // 古い state を展開すると購入で減ったコインを巻き戻してしまう
  const doEquip = async (itemId: string) => {
    const r = await fetch('/api/equip', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId }),
    });
    const d = await r.json();
    if (d.ok) setState(s => (s ? { ...s, equipped: d.equipped } : s));
  };

  const equip = async (itemId: string) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      await doEquip(itemId);
    } catch {
      setMessage('電波が弱いみたい。もう一度試してね');
    } finally { setBusy(false); }
  };

  const buy = async (itemId: string) => {
    if (busy) return;
    const item = ITEM_BY_ID[itemId];
    if (state.coins < item.price) {
      setMessage(`コインが足りないよ（あと${item.price - state.coins}枚）`);
      return;
    }
    setBusy(true); setMessage('');
    try {
      const r = await fetch('/api/shop', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const d = await r.json();
      if (!d.ok) {
        setMessage(d.reason === 'poor' ? 'コインが足りないよ' : '今は買えないみたい');
        return;
      }
      setState(s => (s ? { ...s, coins: d.coins, ownedItems: d.ownedItems } : s));
      setMessage(`${item.name} を手に入れた！`);
      // 着替えだけ失敗しても購入は成功しているので、成功メッセージは残す
      try { await doEquip(itemId); } catch { /* 所持済みなので後から着替えられる */ }
    } catch {
      setMessage('電波が弱いみたい。もう一度試してね');
    } finally { setBusy(false); }
  };

  return (
    <main>
      <Link href="/" style={{ color: 'var(--muted)' }}>← ホーム</Link>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0' }}>
        <Avatar equipped={equipped} size={110} />
        <div>
          <div style={{ fontSize: '1.3rem' }}>🪙 {state.coins}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>★合計 {state.totalStars}個</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>🔥 {state.streak}日連続</div>
        </div>
      </div>

      {message && (
        <p className="card" style={{ textAlign: 'center', color: 'var(--accent)', marginBottom: 12 }}>
          {message}
        </p>
      )}

      {SLOTS.map((slot: Slot) => (
        <section key={slot} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: 8 }}>
            {SLOT_LABEL[slot]}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {ITEMS.filter(i => i.slot === slot).map(item => {
              const owned = isOwned(item.id, state.ownedItems);
              const unlocked = isUnlocked(item, stats);
              const wearing = equipped[slot] === item.id;
              return (
                <div key={item.id} className="card"
                  style={{
                    opacity: unlocked ? 1 : 0.45,
                    outline: wearing ? '3px solid var(--accent)' : 'none',
                  }}>
                  <Avatar equipped={{ ...DEFAULT_EQUIPPED, [slot]: item.id } as Equipped} size={72} />
                  <div style={{ fontSize: '0.9rem', margin: '6px 0' }}>{item.name}</div>
                  {!unlocked && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      🔒 {unlockLabel(item)}
                    </div>
                  )}
                  {unlocked && owned && (
                    <button className="btn-primary" disabled={wearing || busy}
                      onClick={() => equip(item.id)}
                      style={{
                        minHeight: 44, fontSize: '0.85rem', width: '100%',
                        padding: '10px 4px', whiteSpace: 'nowrap',
                        background: wearing ? 'var(--card)' : 'var(--good)',
                        color: wearing ? 'var(--muted)' : '#1a1440',
                      }}>
                      {wearing ? '着てるよ' : '着がえる'}
                    </button>
                  )}
                  {unlocked && !owned && (
                    <button className="btn-primary" disabled={busy}
                      onClick={() => buy(item.id)}
                      style={{
                        minHeight: 44, fontSize: '0.85rem', width: '100%',
                        padding: '10px 4px', whiteSpace: 'nowrap',
                      }}>
                      {item.price}コインで買う
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
