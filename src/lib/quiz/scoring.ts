export type Answer = "A" | "B" | "C" | "D";
export type ScoredResponse = { selected: Answer | null; correct: Answer };
export type ScorePolicy = { correct: number; incorrect: number; unanswered: number };

export const MEC_2026_SCORE_POLICY: ScorePolicy = { correct: 1, incorrect: -0.25, unanswered: 0 };

export function scoreResponses(responses: readonly ScoredResponse[], policy = MEC_2026_SCORE_POLICY) {
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  let score = 0;
  for (const response of responses) {
    if (response.selected === null) { unanswered += 1; score += policy.unanswered; }
    else if (response.selected === response.correct) { correct += 1; score += policy.correct; }
    else { incorrect += 1; score += policy.incorrect; }
  }
  return { correct, incorrect, unanswered, score, maximum: responses.length * policy.correct };
}
