import { expect, test } from 'vitest';
import { STAGES, WORLDS, stageById, nextStageId } from '@/lib/stages';

test('6 worlds, 31 stages, unique ids', () => {
  expect(WORLDS).toHaveLength(6);
  expect(STAGES).toHaveLength(31);
  expect(new Set(STAGES.map(s => s.id)).size).toBe(31);
});

test('every world has at least 5 stages in ascending world order', () => {
  for (let w = 1; w <= 6; w++)
    expect(STAGES.filter(s => s.world === w).length).toBeGreaterThanOrEqual(5);
  const worlds = STAGES.map(s => s.world);
  expect([...worlds].sort((a, b) => a - b)).toEqual(worlds);
});

test('stageById / nextStageId', () => {
  expect(stageById('w1-1')?.world).toBe(1);
  expect(nextStageId('w1-1')).toBe('w1-2');
  expect(nextStageId(STAGES[STAGES.length - 1].id)).toBeNull();
});
