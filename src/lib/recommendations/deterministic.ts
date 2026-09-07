export type TopicSignal = { topicId: string; accuracy: number; attempts: number; avgResponseMs: number; daysSincePractice: number; overdueCards: number };
export function priorityScore(s: TopicSignal) {
  const error = 1 - Math.max(0, Math.min(1, s.accuracy));
  const confidence = Math.min(1, s.attempts / 20);
  const slowness = Math.min(1, s.avgResponseMs / 120000);
  const recency = Math.min(1, s.daysSincePractice / 30);
  const overdue = Math.min(1, s.overdueCards / 20);
  return Number(((error * (0.45 + 0.15 * confidence)) + slowness * 0.12 + recency * 0.13 + overdue * 0.15).toFixed(4));
}
