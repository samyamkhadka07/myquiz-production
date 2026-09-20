import { createHash } from "node:crypto";

export type TutorAction =
  | "EXPLAIN_SIMPLER"
  | "EXPLAIN_DEEPER"
  | "WHY_WRONG"
  | "STEP_BY_STEP"
  | "ANALOGY"
  | "NEPALI"
  | "MNEMONIC";

export type TutorContext = {
  questionId: string;
  questionVersion: number;
  questionText: string;
  options: Record<"A" | "B" | "C" | "D", string>;
  correctAnswer: "A" | "B" | "C" | "D";
  selectedAnswer: "A" | "B" | "C" | "D" | null;
  canonicalExplanation: string;
  optionExplanations: Record<string, string>;
  difficulty: string;
  cognitiveLevel: string;
};

export function tutorFingerprint(context: TutorContext, action: TutorAction, language: string) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        questionId: context.questionId,
        version: context.questionVersion,
        action,
        selected: action === "WHY_WRONG" ? context.selectedAnswer : null,
        language,
        answer: context.correctAnswer,
        explanation: context.canonicalExplanation,
      }),
    )
    .digest("hex");
}

export function contradictsVerifiedAnswer(text: string, verified: string) {
  const assertions = Array.from(
    text.matchAll(/(?:correct|right)\s+(?:answer|option)\s*(?:is|:)\s*\(?([A-D])\)?/gi),
    (match) => match[1]!.toUpperCase(),
  );
  return assertions.some((answer) => answer !== verified);
}
