export function coinsFor(correct: boolean, elapsedMs: number, combo: number): number {
  if (!correct) return 0;
  return 10 + (elapsedMs < 5000 ? 5 : 0) + Math.min(combo, 10);
}
