import { describe, expect, it } from "vitest";
import { overallScore, scoreDimensions } from "@/lib/scoring/score";
import { buildRoadmap } from "@/lib/scoring/prioritize";
import type { CheckId, CheckResult, Finding } from "@/lib/types";

function result(checkId: CheckId, status: CheckResult["status"], findings: Finding[] = [], raw?: unknown): CheckResult {
  return { checkId, status, findings, raw, durationMs: 1 };
}

function finding(over: Partial<Finding> & Pick<Finding, "id" | "dimension" | "severity">): Finding {
  return {
    title: over.id,
    evidence: "evidence",
    recommendation: "fix it",
    impact: 3,
    effort: 2,
    ...over,
  } as Finding;
}

describe("scoreDimensions", () => {
  it("deducts per severity and clamps", () => {
    const checks = {
      gbp: result("gbp", "ok", [
        finding({ id: "a", dimension: "gbp", severity: "critical" }), // -25
        finding({ id: "b", dimension: "gbp", severity: "warning" }), // -10
        finding({ id: "c", dimension: "gbp", severity: "opportunity" }), // -5
      ]),
    };
    const dims = scoreDimensions(checks);
    expect(dims.find((d) => d.dimension === "gbp")?.score).toBe(60);
  });

  it("marks unconfigured dimensions as manual (null)", () => {
    const checks = {
      serp: result("serp", "manual"),
      "ai-visibility": result("ai-visibility", "manual"),
    };
    const dims = scoreDimensions(checks as Partial<Record<CheckId, CheckResult>>);
    expect(dims.find((d) => d.dimension === "serp")?.score).toBeNull();
    expect(dims.find((d) => d.dimension === "ai")?.score).toBeNull();
  });

  it("blends PSI performance into the technical score", () => {
    const checks = {
      "technical-seo": result("technical-seo", "ok", []),
      pagespeed: result("pagespeed", "ok", [], { performanceScore: 50 }),
    };
    const dims = scoreDimensions(checks as Partial<Record<CheckId, CheckResult>>);
    // 0.6 * 100 + 0.4 * 50 = 80
    expect(dims.find((d) => d.dimension === "technical")?.score).toBe(80);
  });
});

describe("overallScore", () => {
  it("renormalizes weights over scoreable dimensions", () => {
    const dims = scoreDimensions({
      gbp: result("gbp", "ok", []),
      serp: result("serp", "manual"),
    } as Partial<Record<CheckId, CheckResult>>);
    // only gbp scoreable at 100 → overall 100 regardless of missing serp
    expect(overallScore(dims)).toBe(100);
  });

  it("returns null when nothing is scoreable", () => {
    const dims = scoreDimensions({ serp: result("serp", "manual") } as Partial<Record<CheckId, CheckResult>>);
    expect(overallScore(dims)).toBeNull();
  });
});

describe("buildRoadmap", () => {
  it("ranks by impact²/effort, dedupes families, caps at 10", () => {
    const many: Finding[] = [];
    for (let i = 0; i < 15; i++) {
      many.push(finding({ id: `f${i}`, dimension: "technical", severity: "warning", impact: ((i % 5) + 1) as Finding["impact"], effort: 2 }));
    }
    // duplicates of one family across pages
    many.push(finding({ id: "f1", dimension: "technical", severity: "warning" }));
    many.push(finding({ id: "f1", dimension: "technical", severity: "critical" }));

    const roadmap = buildRoadmap({ "technical-seo": result("technical-seo", "ok", many) });
    expect(roadmap).toHaveLength(10);
    expect(roadmap[0].priorityScore).toBeGreaterThanOrEqual(roadmap[9].priorityScore);
    const f1 = roadmap.find((r) => r.finding.id === "f1");
    expect(f1?.finding.severity).toBe("critical"); // worst instance survives
    expect(f1?.alsoOn).toBe(2);
    // pass findings never appear
    expect(roadmap.every((r) => r.finding.severity !== "pass")).toBe(true);
  });

  it("excludes pass and info findings", () => {
    const roadmap = buildRoadmap({
      gbp: result("gbp", "ok", [
        finding({ id: "ok1", dimension: "gbp", severity: "pass" }),
        finding({ id: "info1", dimension: "gbp", severity: "info" }),
      ]),
    });
    expect(roadmap).toEqual([]);
  });
});
