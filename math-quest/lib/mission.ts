import type { Problem } from './types';
import { generateProblem } from './problems';

export function buildMission(
  reviews: Problem[], stageId: string, total = 10,
): { problem: Problem; isReview: boolean }[] {
  const rev = reviews.slice(0, 3).map(problem => ({ problem, isReview: true }));
  const fresh = Array.from({ length: total - rev.length }, () => ({
    problem: generateProblem(stageId), isReview: false,
  }));
  return [...rev, ...fresh];
}
