import { STAGES, stageById } from './stages';

export type MonsterShape = 'slime' | 'bat' | 'rock' | 'ghost' | 'fish' | 'dragon';
export type Monster = { world: number; name: string; color: string; shape: MonsterShape };

export const MONSTERS: Monster[] = [
  { world: 1, name: 'ククスライム', color: '#4ade80', shape: 'slime' },
  { world: 2, name: 'モリコウモリ', color: '#a78bfa', shape: 'bat' },
  { world: 3, name: 'イワゴーレム', color: '#94a3b8', shape: 'rock' },
  { world: 4, name: 'タニゴースト', color: '#38bdf8', shape: 'ghost' },
  { world: 5, name: 'ウミノヌシ', color: '#f472b6', shape: 'fish' },
  { world: 6, name: 'ブンスウドラゴン', color: '#fb7185', shape: 'dragon' },
];

export const BOSS_BONUS_COINS = 50;
export const MONSTER_BONUS_COINS = 30;

export function monsterFor(stageId: string): Monster {
  const world = stageById(stageId)?.world ?? 1;
  return MONSTERS.find(m => m.world === world) ?? MONSTERS[0];
}

export function isBossStage(stageId: string): boolean {
  const stage = stageById(stageId);
  if (!stage) return false;
  const sameWorld = STAGES.filter(s => s.world === stage.world);
  return sameWorld[sameWorld.length - 1].id === stageId;
}

export function bossWorldOf(stageId: string): number | null {
  if (!isBossStage(stageId)) return null;
  return stageById(stageId)!.world;
}

export function maxHpFor(totalQuestions: number, isBoss: boolean): number {
  return Math.max(1, totalQuestions - (isBoss ? 1 : 2));
}

export function damageFor(correct: boolean, combo: number): number {
  if (!correct) return 0;
  return combo >= 3 ? 2 : 1;
}
