export type BankCandidate = {
  unit_id: string;
  cognitive_level: string | null;
  exam_program_id: string | null;
};

export type FullExamReadiness = {
  required: number;
  eligible: number;
  assignable: number;
  feasible: boolean;
  unitShortfalls: Array<{ unit_id: string; missing: number }>;
  cognitiveShortfalls: Array<{ level: string; missing: number }>;
};

/** Mirror the FULL-test unit/cognitive capacity constraints without leaking answers. */
export function calculateFullExamReadiness(
  blueprint: { question_count: number; cognitive_distribution: Record<string, number> },
  allocations: Array<{ unit_id: string; question_count: number }>,
  published: BankCandidate[],
  programId: string,
): FullExamReadiness {
  const levels = ["RECALL", "UNDERSTANDING", "APPLICATION"];
  const required = blueprint.question_count;
  const allocatedUnits = new Set(allocations.map((a) => a.unit_id));
  const eligible = published.filter(
    (q) => allocatedUnits.has(q.unit_id) && (q.exam_program_id === null || q.exam_program_id === programId),
  );
  const byCell = new Map<string, number>();
  for (const q of eligible) {
    if (levels.includes(q.cognitive_level ?? "")) {
      const key = `${q.unit_id}:${q.cognitive_level}`;
      byCell.set(key, (byCell.get(key) ?? 0) + 1);
    }
  }
  const unitShortfalls = allocations.map((a) => ({
    unit_id: a.unit_id,
    missing: Math.max(0, a.question_count - levels.reduce(
      (n, level) => n + (byCell.get(`${a.unit_id}:${level}`) ?? 0), 0,
    )),
  })).filter((a) => a.missing > 0);
  const cognitiveTargets = levels.map(
    (level) => required * (blueprint.cognitive_distribution[level] ?? 0) / 100,
  );
  const cognitiveShortfalls = levels.map((level, i) => ({
    level,
    missing: Math.max(0, cognitiveTargets[i]! - allocations.reduce(
      (n, a) => n + (byCell.get(`${a.unit_id}:${level}`) ?? 0), 0,
    )),
  })).filter((a) => a.missing > 0);
  const totalAllocations = allocations.reduce((n, a) => n + a.question_count, 0);
  const validTargets = cognitiveTargets.every(Number.isInteger)
    && cognitiveTargets.reduce((a, b) => a + b, 0) === required;
  if (!validTargets || totalAllocations !== required || required < 1) {
    return { required, eligible: eligible.length, assignable: 0, feasible: false, unitShortfalls, cognitiveShortfalls };
  }
  // Max-flow: source -> units -> cognitive levels -> sink.
  const source = 0, levelStart = 1 + allocations.length, sink = levelStart + levels.length;
  const capacity = Array.from({ length: sink + 1 }, () => new Array<number>(sink + 1).fill(0));
  allocations.forEach((a, i) => {
    capacity[source]![i + 1] = a.question_count;
    levels.forEach((level, j) => {
      capacity[i + 1]![levelStart + j] = byCell.get(`${a.unit_id}:${level}`) ?? 0;
    });
  });
  cognitiveTargets.forEach((n, j) => { capacity[levelStart + j]![sink] = n; });
  let assignable = 0;
  while (true) {
    const parents = new Array<number>(sink + 1).fill(-1);
    const queue = [source];
    parents[source] = source;
    for (let at = 0; at < queue.length && parents[sink] === -1; at++) {
      const from = queue[at]!;
      for (let to = 0; to <= sink; to++) {
        if (parents[to] === -1 && capacity[from]![to]! > 0) {
          parents[to] = from;
          queue.push(to);
        }
      }
    }
    if (parents[sink] === -1) break;
    let augment = Infinity;
    for (let v = sink; v !== source; v = parents[v]!) {
      augment = Math.min(augment, capacity[parents[v]!]![v]!);
    }
    for (let v = sink; v !== source; v = parents[v]!) {
      const u = parents[v]!;
      capacity[u]![v] -= augment;
      capacity[v]![u] += augment;
    }
    assignable += augment;
  }
  return { required, eligible: eligible.length, assignable, feasible: assignable === required, unitShortfalls, cognitiveShortfalls };
}
