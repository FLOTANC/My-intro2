export function todayJST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(now);
}

export function nextStreak(lastPlayDate: string | null, today: string, current: number): number {
  if (lastPlayDate === today) return current;
  if (lastPlayDate) {
    const prev = new Date(lastPlayDate + 'T00:00:00Z');
    const cur = new Date(today + 'T00:00:00Z');
    if (cur.getTime() - prev.getTime() === 86400000) return current + 1;
  }
  return 1;
}
