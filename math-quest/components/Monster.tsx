import type { Monster, MonsterShape } from '@/lib/battle';

const EYE = 'var(--bg)';

function Eyes({ y = 42 }: { y?: number }) {
  return (
    <g fill={EYE}>
      <circle cx="40" cy={y} r="5" />
      <circle cx="60" cy={y} r="5" />
    </g>
  );
}

function Body({ shape, color }: { shape: MonsterShape; color: string }) {
  if (shape === 'bat') return (
    <g fill={color}>
      <polygon points="20,32 6,22 8,46" />
      <polygon points="80,32 94,22 92,46" />
      <rect x="28" y="26" width="44" height="38" rx="14" />
      <polygon points="34,28 38,15 46,28" />
      <polygon points="66,28 62,15 54,28" />
    </g>
  );
  if (shape === 'rock') return (
    <g fill={color}>
      <polygon points="22,66 30,24 70,24 78,66" />
      <rect x="18" y="62" width="64" height="12" rx="4" />
    </g>
  );
  if (shape === 'ghost') return (
    <g fill={color}>
      <path d="M24 66 V40 a26 26 0 0 1 52 0 v26 l-9 -8 -8 8 -9 -8 -8 8 -9 -8 z" />
    </g>
  );
  if (shape === 'fish') return (
    <g fill={color}>
      <ellipse cx="52" cy="44" rx="30" ry="22" />
      <polygon points="22,44 6,30 6,58" />
      <polygon points="52,24 46,14 62,17" />
    </g>
  );
  if (shape === 'dragon') return (
    <g fill={color}>
      <polygon points="26,54 6,60 26,68" />
      <polygon points="74,54 94,60 74,68" />
      <rect x="26" y="26" width="48" height="38" rx="12" />
      <polygon points="30,26 24,10 42,20" />
      <polygon points="70,26 76,10 58,20" />
    </g>
  );
  return (
    <g fill={color}>
      <path d="M20 66 a30 30 0 0 1 60 0 z" />
      <ellipse cx="50" cy="66" rx="30" ry="6" />
    </g>
  );
}

export default function MonsterView({
  monster, isBoss = false, hurt = false, defeated = false, size = 120,
}: {
  monster: Monster; isBoss?: boolean; hurt?: boolean; defeated?: boolean; size?: number;
}) {
  const eyeY = monster.shape === 'rock' ? 46
    : monster.shape === 'fish' ? 40
    : monster.shape === 'slime' ? 48
    : 42;
  // ボスは表示サイズ自体を一回り大きくする（内部だけの拡大だと王冠と体が
  // ぶつかりやすいため、控えめな内部スケール + 外形サイズアップで対応）
  const displaySize = isBoss ? size * 1.28 : size;
  return (
    <svg viewBox="0 0 100 80" width={displaySize} height={displaySize * 0.8}
      role="img" aria-label={`${isBoss ? 'ボス' : 'てき'}の${monster.name}${defeated ? '（撃破）' : hurt ? '（ダメージ）' : ''}`}
      style={{
        display: 'block',
        overflow: 'visible',
        transition: 'transform 220ms ease, opacity 220ms ease, filter 160ms ease',
        transform: defeated ? 'rotate(84deg) scale(0.82)' : hurt ? 'translateX(3px)' : 'none',
        opacity: defeated ? 0.4 : 1,
        filter: defeated ? 'grayscale(0.55)' : 'none',
      }}>
      <g transform={isBoss ? 'translate(50,54) scale(1.06) translate(-50,-50)' : undefined}>
        <Body shape={monster.shape} color={monster.color} />
        {/* ダメージ時は体の形そのものを赤くする（枠全体を塗るとカードが赤くなって見える） */}
        <g opacity={hurt ? 0.8 : 0}
          style={{ transition: 'opacity 150ms ease', pointerEvents: 'none' }}>
          <Body shape={monster.shape} color="var(--hit)" />
        </g>
        <Eyes y={eyeY} />
      </g>
      {isBoss && (
        <polygon points="34,14 34,2 42,9 50,0 58,9 66,2 66,14" fill="var(--accent)" stroke="var(--bg)" strokeWidth="1" strokeLinejoin="round" />
      )}
    </svg>
  );
}
