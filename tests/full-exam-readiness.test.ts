import { describe, expect, it } from "vitest";
import { calculateFullExamReadiness } from "@/lib/quiz/full-exam-readiness";

const blueprint = { question_count: 4, cognitive_distribution: { RECALL: 50, UNDERSTANDING: 50, APPLICATION: 0 } };
const allocations = [{ unit_id: "B1", question_count: 2 }, { unit_id: "Z1", question_count: 2 }];
const q = (unit_id: string, cognitive_level: string | null, exam_program_id: string | null = null) =>
  ({ unit_id, cognitive_level, exam_program_id });

describe("200-mark exam readiness", () => {
  it("requires the full official unit and cognitive distribution", () => {
    const bank = [q("B1", "RECALL"), q("B1", "UNDERSTANDING"), q("Z1", "RECALL"), q("Z1", "UNDERSTANDING")];
    expect(calculateFullExamReadiness(blueprint, allocations, bank, "MBBS"))
      .toMatchObject({ feasible: true, eligible: 4, assignable: 4 });
  });
  it("rejects an insufficient verified bank", () => {
    const bank = [q("B1", "RECALL"), q("B1", "UNDERSTANDING"), q("Z1", "RECALL")];
    expect(calculateFullExamReadiness(blueprint, allocations, bank, "MBBS"))
      .toMatchObject({ feasible: false, assignable: 3 });
  });
  it("rejects a cognitive mismatch even with four questions", () => {
    const bank = [q("B1", "RECALL"), q("B1", "RECALL"), q("Z1", "RECALL"), q("Z1", "UNDERSTANDING")];
    expect(calculateFullExamReadiness(blueprint, allocations, bank, "MBBS"))
      .toMatchObject({ feasible: false, assignable: 3 });
  });
  it("excludes questions restricted to other programs and unrelated units", () => {
    const bank = [q("B1","RECALL","BDS"),q("B1","UNDERSTANDING"),q("Z1","RECALL"),q("Z1","UNDERSTANDING"),q("P1","RECALL")];
    expect(calculateFullExamReadiness(blueprint, allocations, bank, "MBBS"))
      .toMatchObject({ eligible: 3, feasible: false });
  });
  it("excludes unclassified cognitive levels from assignment", () => {
    const bank = [q("B1","RECALL"),q("B1","UNDERSTANDING"),q("Z1","RECALL"),q("Z1",null)];
    expect(calculateFullExamReadiness(blueprint, allocations, bank, "MBBS").feasible).toBe(false);
  });
});
