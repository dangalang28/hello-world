import type { Check, CheckInput, CheckMeta, CheckResult, Finding } from "@/lib/types";

/** Wraps a check body with timing and error-to-result conversion. */
export function defineCheck(
  meta: CheckMeta,
  body: (input: CheckInput) => Promise<Omit<CheckResult, "checkId" | "durationMs">>,
): Check {
  return {
    ...meta,
    async run(input) {
      const start = Date.now();
      try {
        const partial = await body(input);
        return { checkId: meta.id, durationMs: Date.now() - start, ...partial };
      } catch (err) {
        return {
          checkId: meta.id,
          status: "error",
          findings: [],
          note: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        };
      }
    },
  };
}

export function pass(f: Omit<Finding, "severity" | "impact" | "effort" | "recommendation"> & { recommendation?: string }): Finding {
  return { severity: "pass", impact: 1, effort: 1, recommendation: f.recommendation ?? "No action needed.", ...f };
}
