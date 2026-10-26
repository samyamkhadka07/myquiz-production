import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Group I practice disclosures", () => {
  it("labels practice attempts whose answer bank is provisional", () => {
    const quiz = readFileSync("src/components/quiz.tsx", "utf8");
    const result = readFileSync("src/app/(student)/results/[id]/page.tsx", "utf8");
    expect(quiz).toContain("Provisional practice");
    expect(result).toContain("Provisional practice");
  });
});
