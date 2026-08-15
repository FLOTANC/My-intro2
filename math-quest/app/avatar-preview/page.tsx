import Avatar from '@/components/Avatar';
import { ITEMS, DEFAULT_EQUIPPED, SLOTS, type Equipped } from '@/lib/avatar';

// 全アイテムを1つずつ着せた見え方を並べる確認用ページ（Task 4で削除する）
export default function AvatarPreview() {
  const variants: { label: string; equipped: Equipped }[] = [
    { label: 'きほん', equipped: DEFAULT_EQUIPPED },
    ...ITEMS.filter(i => i.price > 0).map(i => ({
      label: `${i.slot}: ${i.name}`,
      equipped: { ...DEFAULT_EQUIPPED, [i.slot]: i.id } as Equipped,
    })),
  ];
  return (
    <main>
      <h1 style={{ margin: '12px 0' }}>アバター確認（{variants.length}パターン / {SLOTS.length}スロット）</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {variants.map(v => (
          <div key={v.label} className="card" style={{ textAlign: 'center' }}>
            <Avatar equipped={v.equipped} size={120} />
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{v.label}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
