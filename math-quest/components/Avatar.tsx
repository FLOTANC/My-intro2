import { ITEM_BY_ID, DEFAULT_EQUIPPED, type Equipped, type Slot } from '@/lib/avatar';

const OUTLINE = '#00000022';

function Hair({ shape, color }: { shape?: string; color?: string }) {
  const c = color ?? '#3b2b1a';
  if (shape === 'spiky') return (
    <g fill={c}>
      <polygon points="30,20 38,4 44,20" />
      <polygon points="42,20 50,2 58,20" />
      <polygon points="56,20 62,4 70,20" />
      <rect x="30" y="16" width="40" height="8" />
    </g>
  );
  if (shape === 'long') return (
    <g fill={c}>
      <rect x="28" y="12" width="44" height="16" rx="6" />
      <rect x="26" y="20" width="8" height="40" rx="4" />
      <rect x="66" y="20" width="8" height="40" rx="4" />
    </g>
  );
  if (shape === 'twin') return (
    <g fill={c}>
      <rect x="28" y="12" width="44" height="14" rx="6" />
      <circle cx="24" cy="34" r="9" />
      <circle cx="76" cy="34" r="9" />
    </g>
  );
  return <rect x="28" y="12" width="44" height="14" rx="6" fill={c} />;
}

function Hat({ shape, color }: { shape?: string; color?: string }) {
  const c = color ?? '#ef4444';
  if (shape === 'cap') return (
    <g fill={c}>
      <rect x="28" y="8" width="44" height="12" rx="5" />
      <rect x="28" y="18" width="30" height="5" rx="2" />
    </g>
  );
  if (shape === 'wizard') return (
    <g>
      <polygon points="50,1 35,19 65,19" fill={c} />
      <rect x="38" y="12" width="24" height="4" fill="#ffb703" />
      <rect x="24" y="17" width="52" height="6" rx="3" fill={c} />
    </g>
  );
  if (shape === 'crown') return (
    <g fill={c}>
      <polygon points="30,18 30,4 40,12 50,2 60,12 70,4 70,18" />
      <rect x="30" y="16" width="40" height="5" />
    </g>
  );
  return null;
}

function Face({ shape }: { shape?: string }) {
  const eye = '#1a1440';
  if (shape === 'cool') return (
    <g fill={eye}>
      <rect x="38" y="32" width="8" height="3" />
      <rect x="54" y="32" width="8" height="3" />
      <rect x="44" y="44" width="12" height="3" rx="1" />
    </g>
  );
  if (shape === 'glasses') return (
    <g>
      <circle cx="42" cy="34" r="6" fill="none" stroke={eye} strokeWidth="2" />
      <circle cx="58" cy="34" r="6" fill="none" stroke={eye} strokeWidth="2" />
      <rect x="48" y="33" width="4" height="2" fill={eye} />
      <path d="M44 44 q6 5 12 0" fill="none" stroke={eye} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
  if (shape === 'star') return (
    <g fill="#ffb703">
      <polygon points="42,28 44,34 50,34 45,38 47,44 42,40 37,44 39,38 34,34 40,34" />
      <polygon points="58,28 60,34 66,34 61,38 63,44 58,40 53,44 55,38 50,34 56,34" />
    </g>
  );
  return (
    <g>
      <circle cx="42" cy="34" r="3.5" fill={eye} />
      <circle cx="58" cy="34" r="3.5" fill={eye} />
      <path d="M43 43 q7 6 14 0" fill="none" stroke={eye} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

// 素足に見えないよう、ワンピース以外は下ばきを描く
function Bottoms({ color = '#334155' }: { color?: string }) {
  return (
    <g fill={color}>
      <rect x="33" y="86" width="34" height="12" rx="3" />
      <rect x="35" y="94" width="12" height="8" rx="2" />
      <rect x="53" y="94" width="12" height="8" rx="2" />
    </g>
  );
}

function Clothes({ shape, color }: { shape?: string; color?: string }) {
  const c = color ?? '#38bdf8';
  if (shape === 'hoodie') return (
    <g>
      <Bottoms />
      <g fill={c}>
        <rect x="30" y="56" width="40" height="38" rx="4" />
        <rect x="20" y="58" width="12" height="26" rx="4" />
        <rect x="68" y="58" width="12" height="26" rx="4" />
        <rect x="36" y="52" width="28" height="10" rx="5" />
      </g>
    </g>
  );
  if (shape === 'dress') return (
    <g fill={c}>
      <rect x="32" y="56" width="36" height="20" />
      <polygon points="32,74 68,74 76,98 24,98" />
    </g>
  );
  if (shape === 'armor') return (
    <g>
      <Bottoms color="#64748b" />
      <g fill={c}>
        <rect x="30" y="56" width="40" height="38" rx="4" />
        <rect x="18" y="56" width="14" height="14" rx="5" />
        <rect x="68" y="56" width="14" height="14" rx="5" />
        <rect x="46" y="60" width="8" height="30" fill="#94a3b8" />
      </g>
    </g>
  );
  return (
    <g>
      <Bottoms />
      <g fill={c}>
        <rect x="32" y="56" width="36" height="34" rx="3" />
        <rect x="22" y="58" width="12" height="14" rx="3" />
        <rect x="66" y="58" width="12" height="14" rx="3" />
      </g>
    </g>
  );
}

export default function Avatar({ equipped, size = 160 }: { equipped: Equipped; size?: number }) {
  const pick = (slot: Slot) => ITEM_BY_ID[equipped[slot]] ?? ITEM_BY_ID[DEFAULT_EQUIPPED[slot]];
  const bg = pick('bg'), body = pick('body'), clothes = pick('clothes');
  const hair = pick('hair'), hat = pick('hat'), face = pick('face');
  const skin = body.color ?? '#f5c9a6';

  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2}
      role="img" aria-label="アバター" style={{ display: 'block' }}>
      <rect width="100" height="120" rx="14" fill={bg.color ?? '#1a1440'} />
      {/* あし */}
      <rect x="36" y="90" width="10" height="22" rx="3" fill={skin} />
      <rect x="54" y="90" width="10" height="22" rx="3" fill={skin} />
      {/* うで */}
      <rect x="22" y="58" width="10" height="28" rx="4" fill={skin} />
      <rect x="68" y="58" width="10" height="28" rx="4" fill={skin} />
      {/* どうたい */}
      <rect x="32" y="56" width="36" height="36" rx="4" fill={skin} />
      <Clothes shape={clothes.shape} color={clothes.color} />
      {/* あたま */}
      <rect x="30" y="16" width="40" height="38" rx="6" fill={skin} stroke={OUTLINE} />
      <Face shape={face.shape} />
      <Hair shape={hair.shape} color={hair.color} />
      <Hat shape={hat.shape} color={hat.color} />
    </svg>
  );
}
