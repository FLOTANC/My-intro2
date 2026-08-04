export type StageDef = { id: string; world: number; title: string };

export const WORLDS = [
  { id: 1, title: '九九の島' },
  { id: 2, title: 'わり算の森' },
  { id: 3, title: '筆算の山' },
  { id: 4, title: '筆算の谷' },
  { id: 5, title: '小数の海' },
  { id: 6, title: '分数の城' },
];

const defs: [string, number, string][] = [
  ['w1-1', 1, '2・3のだん'], ['w1-2', 1, '4・5のだん'], ['w1-3', 1, '6・7のだん'],
  ['w1-4', 1, '8・9のだん'], ['w1-5', 1, '九九ミックス'], ['w1-6', 1, '九九マスター'],
  ['w2-1', 2, '九九のぎゃく算'], ['w2-2', 2, 'わり算きほん'], ['w2-3', 2, 'あまりのあるわり算'],
  ['w2-4', 2, 'あまり チャレンジ'], ['w2-5', 2, 'わり算ミックス'],
  ['w3-1', 3, '2けた×1けた'], ['w3-2', 3, '3けた×1けた'], ['w3-3', 3, '2けた×2けた'],
  ['w3-4', 3, '3けた×2けた'], ['w3-5', 3, 'かけ算筆算ミックス'],
  ['w4-1', 4, '2けた÷1けた'], ['w4-2', 4, '3けた÷1けた'], ['w4-3', 4, 'あまりつき筆算'],
  ['w4-4', 4, '3けた÷2けた'], ['w4-5', 4, 'わり算筆算ミックス'],
  ['w5-1', 5, '小数×整数'], ['w5-2', 5, '小数×小数'], ['w5-3', 5, '小数÷整数'],
  ['w5-4', 5, '小数÷小数'], ['w5-5', 5, '小数ミックス'],
  ['w6-1', 6, '分数×整数'], ['w6-2', 6, '分数×分数'], ['w6-3', 6, '分数÷分数'],
  ['w6-4', 6, '約分チャレンジ'], ['w6-5', 6, '分数ミックス'],
];

export const STAGES: StageDef[] = defs.map(([id, world, title]) => ({ id, world, title }));

export function stageById(id: string): StageDef | undefined {
  return STAGES.find(s => s.id === id);
}

export function nextStageId(id: string): string | null {
  const i = STAGES.findIndex(s => s.id === id);
  if (i < 0 || i === STAGES.length - 1) return null;
  return STAGES[i + 1].id;
}
