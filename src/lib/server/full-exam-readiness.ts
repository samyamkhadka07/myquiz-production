import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Taxonomy } from "@/lib/contracts";
import {
  calculateFullExamReadiness,
  type BankCandidate,
  type FullExamReadiness,
} from "@/lib/quiz/full-exam-readiness";

/** Aggregate eligibility server-side; never send question texts or answer keys to students. */
export async function getFullExamReadiness(t: Taxonomy): Promise<Record<string, FullExamReadiness>> {
  const unitIds = [...new Set(t.allocations.map((a) => a.unit_id))];
  if (!unitIds.length) return {};
  const db = createAdminClient();
  const bank: BankCandidate[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db
      .from("questions")
      .select("id,unit_id,cognitive_level,exam_program_id")
      .eq("lifecycle", "PUBLISHED")
      .eq("verification_status", "VERIFIED")
      .eq("publication_status", "PUBLISHED")
      .in("unit_id", unitIds)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Unable to read full-exam question-bank coverage");
    const page = data ?? [];
    bank.push(...page.map((q) => ({
      unit_id: q.unit_id,
      cognitive_level: q.cognitive_level,
      exam_program_id: q.exam_program_id,
    })));
    if (page.length < pageSize) break;
  }
  return Object.fromEntries(
    t.programs.flatMap((program) => {
      const blueprint = t.blueprints.find((b) => b.exam_group_id === program.exam_group_id);
      if (!blueprint) return [];
      const allocations = t.allocations.filter((a) => a.blueprint_id === blueprint.id);
      return [[program.id, calculateFullExamReadiness(blueprint, allocations, bank, program.id)]];
    }),
  );
}
