import type { Finding } from "@/lib/types";
import { defineCheck, pass } from "./util";

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

interface PsiSummary {
  performanceScore: number | null; // 0-100
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
  viewportOk: boolean | null;
}

function parsePsi(json: unknown): PsiSummary {
  const j = json as Record<string, any>;
  const lighthouse = j?.lighthouseResult;
  const audits = lighthouse?.audits ?? {};
  const perf = lighthouse?.categories?.performance?.score;
  return {
    performanceScore: typeof perf === "number" ? Math.round(perf * 100) : null,
    lcpMs: audits["largest-contentful-paint"]?.numericValue ?? null,
    cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
    inpMs: audits["interaction-to-next-paint"]?.numericValue ?? null,
    viewportOk: audits["viewport"] ? audits["viewport"].score === 1 : null,
  };
}

export const pagespeedCheck = defineCheck(
  { id: "pagespeed", name: "Speed & Mobile Experience", dimension: "technical", requires: [] },
  async ({ scan }) => {
    let url = scan.websiteUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    const params = new URLSearchParams({ url, strategy: "mobile", category: "performance" });
    if (process.env.GOOGLE_API_KEY) params.set("key", process.env.GOOGLE_API_KEY);

    let res: Response;
    try {
      res = await fetch(`${PSI_ENDPOINT}?${params}`, { signal: AbortSignal.timeout(110_000) });
    } catch {
      return {
        status: "manual" as const,
        findings: [],
        note: "PageSpeed Insights timed out or was unreachable.",
        manualChecklist: [
          { step: `Run ${url} through https://pagespeed.web.dev manually.`, lookFor: "Mobile performance score below 50, LCP above 2.5s." },
        ],
      };
    }

    if (!res.ok) {
      return {
        status: "manual" as const,
        findings: [],
        note: `PageSpeed Insights returned HTTP ${res.status}.`,
        manualChecklist: [
          { step: `Run ${url} through https://pagespeed.web.dev manually.`, lookFor: "Mobile performance score below 50, LCP above 2.5s." },
        ],
      };
    }

    const summary = parsePsi(await res.json());
    const findings: Finding[] = [];

    if (summary.performanceScore !== null) {
      if (summary.performanceScore < 50) {
        findings.push({
          id: "speed.poor-performance",
          dimension: "technical",
          severity: "critical",
          title: `Mobile performance score is ${summary.performanceScore}/100`,
          evidence: `Lighthouse mobile performance: ${summary.performanceScore}. Slow pages lose rankings and visitors.`,
          recommendation: "Compress images, reduce unused scripts, and enable caching. Target a score above 70.",
          impact: 4,
          effort: 3,
        });
      } else if (summary.performanceScore < 80) {
        findings.push({
          id: "speed.fair-performance",
          dimension: "technical",
          severity: "warning",
          title: `Mobile performance score is ${summary.performanceScore}/100`,
          evidence: `Lighthouse mobile performance: ${summary.performanceScore}.`,
          recommendation: "Optimize the largest images and defer non-critical scripts to push the score above 80.",
          impact: 3,
          effort: 3,
        });
      } else {
        findings.push(pass({ id: "speed.good-performance", dimension: "technical", title: `Strong mobile performance (${summary.performanceScore}/100)`, evidence: "Lighthouse mobile performance score." }));
      }
    }

    if (summary.lcpMs !== null && summary.lcpMs > 2500) {
      findings.push({
        id: "speed.slow-lcp",
        dimension: "technical",
        severity: summary.lcpMs > 4000 ? "warning" : "opportunity",
        title: `Largest Contentful Paint is ${(summary.lcpMs / 1000).toFixed(1)}s`,
        evidence: `LCP ${(summary.lcpMs / 1000).toFixed(1)}s (Google's \"good\" threshold is 2.5s).`,
        recommendation: "Optimize the hero image (size, format, preload) — it is usually the LCP element.",
        impact: 3,
        effort: 2,
      });
    }

    if (summary.cls !== null && summary.cls > 0.1) {
      findings.push({
        id: "speed.high-cls",
        dimension: "technical",
        severity: "opportunity",
        title: `Layout shift (CLS ${summary.cls.toFixed(2)})`,
        evidence: `CLS ${summary.cls.toFixed(2)} exceeds Google's 0.1 threshold.`,
        recommendation: "Set explicit width/height on images and reserve space for embeds and ads.",
        impact: 2,
        effort: 2,
      });
    }

    if (summary.viewportOk === false) {
      findings.push({
        id: "speed.no-viewport",
        dimension: "technical",
        severity: "critical",
        title: "Page is not mobile-friendly (no viewport)",
        evidence: "Lighthouse viewport audit failed — the page does not adapt to phone screens.",
        recommendation: "Add a responsive viewport meta tag and mobile styles. Most local searches happen on phones.",
        impact: 5,
        effort: 3,
      });
    }

    return { status: "ok" as const, findings, raw: summary };
  },
);
