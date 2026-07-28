import type { CheckId, CheckResult, Finding, RoadmapItem } from "@/lib/types";

/**
 * Builds the Top-10 roadmap: actionable findings ranked by impact² / effort
 * (squaring impact biases toward high-impact items even at moderate effort),
 * deduplicated by finding family — the worst instance survives, the rest
 * roll up into an "also on N pages" count.
 */
export function buildRoadmap(checks: Partial<Record<CheckId, CheckResult>>, limit = 10): RoadmapItem[] {
  const SEVERITY_ORDER = { critical: 0, warning: 1, opportunity: 2, pass: 3, info: 3 } as const;

  const actionable = Object.values(checks)
    .filter((c): c is CheckResult => Boolean(c))
    .flatMap((c) => c.findings)
    .filter((f) => f.severity === "critical" || f.severity === "warning" || f.severity === "opportunity");

  const families = new Map<string, { finding: Finding; count: number }>();
  for (const f of actionable) {
    const existing = families.get(f.id);
    if (!existing) {
      families.set(f.id, { finding: f, count: 1 });
    } else {
      existing.count++;
      if (SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[existing.finding.severity]) {
        existing.finding = f;
      }
    }
  }

  return [...families.values()]
    .map(({ finding, count }) => ({
      finding,
      alsoOn: count > 1 ? count - 1 : undefined,
      priorityScore: (finding.impact * finding.impact) / finding.effort,
    }))
    .sort(
      (a, b) =>
        b.priorityScore - a.priorityScore ||
        SEVERITY_ORDER[a.finding.severity] - SEVERITY_ORDER[b.finding.severity],
    )
    .slice(0, limit)
    .map((item, i) => ({ rank: i + 1, ...item }));
}
