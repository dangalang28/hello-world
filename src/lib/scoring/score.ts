import type { CheckId, CheckResult, Dimension, DimensionScore, Severity } from "@/lib/types";

const DEDUCTION: Record<Severity, number> = {
  critical: 25,
  warning: 10,
  opportunity: 5,
  pass: 0,
  info: 0,
};

export const DIMENSION_WEIGHTS: Record<Dimension, number> = {
  gbp: 0.2,
  technical: 0.2,
  nap: 0.15,
  serp: 0.15,
  "structured-data": 0.12,
  keywords: 0.1,
  ai: 0.08,
};

export const DIMENSION_LABELS: Record<Dimension, string> = {
  serp: "Branded Search",
  gbp: "Google Business Profile",
  nap: "Identity Consistency",
  keywords: "Keyword Opportunity",
  technical: "Technical SEO",
  "structured-data": "Structured Data",
  ai: "AI Search Visibility",
};

function emptyCounts(): Record<Severity, number> {
  return { critical: 0, warning: 0, opportunity: 0, pass: 0, info: 0 };
}

export function scoreDimensions(checks: Partial<Record<CheckId, CheckResult>>): DimensionScore[] {
  const results = Object.values(checks).filter((c): c is CheckResult => Boolean(c));
  const dims = Object.keys(DIMENSION_WEIGHTS) as Dimension[];

  return dims.map((dimension) => {
    const dimResults = results.filter((r) => {
      const meta = r.findings[0]?.dimension;
      // a check contributes to its declared dimension even with zero findings —
      // match on the check's findings, falling back to result-level mapping below
      return meta === dimension || CHECK_DIMENSION[r.checkId] === dimension;
    });

    const findingCount = emptyCounts();
    let scoreable = false;
    let deductions = 0;
    let psiScore: number | null = null;

    for (const r of dimResults) {
      if (r.status === "ok" || r.status === "partial") scoreable = true;
      for (const f of r.findings) {
        if (f.dimension !== dimension) continue;
        findingCount[f.severity]++;
        deductions += DEDUCTION[f.severity];
      }
      if (r.checkId === "pagespeed" && r.status === "ok") {
        const raw = r.raw as { performanceScore?: number | null } | undefined;
        if (typeof raw?.performanceScore === "number") psiScore = raw.performanceScore;
      }
    }

    if (!scoreable) {
      return { dimension, score: null, label: "manual" as const, findingCount };
    }

    let score = Math.max(0, Math.min(100, 100 - deductions));
    if (dimension === "technical" && psiScore !== null) {
      score = Math.round(0.6 * score + 0.4 * psiScore);
    }

    return {
      dimension,
      score,
      label: score >= 80 ? ("strong" as const) : score >= 50 ? ("fair" as const) : ("weak" as const),
      findingCount,
    };
  });
}

export function overallScore(dimensions: DimensionScore[]): number | null {
  const scoreable = dimensions.filter((d) => d.score !== null);
  if (scoreable.length === 0) return null;
  const totalWeight = scoreable.reduce((s, d) => s + DIMENSION_WEIGHTS[d.dimension], 0);
  const weighted = scoreable.reduce((s, d) => s + d.score! * DIMENSION_WEIGHTS[d.dimension], 0);
  return Math.round(weighted / totalWeight);
}

const CHECK_DIMENSION: Record<CheckId, Dimension> = {
  indexability: "technical",
  "technical-seo": "technical",
  "structured-data": "structured-data",
  pagespeed: "technical",
  gbp: "gbp",
  "nap-consistency": "nap",
  keywords: "keywords",
  serp: "serp",
  "ai-visibility": "ai",
};
