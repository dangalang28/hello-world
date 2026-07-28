import type {
  CheckId,
  CheckResult,
  CrawlBundle,
  FixAsset,
  GbpData,
  ScanInput,
  ScanNarrative,
  ScanResult,
} from "@/lib/types";
import { overallScore, scoreDimensions, DIMENSION_LABELS } from "@/lib/scoring/score";
import { buildRoadmap } from "@/lib/scoring/prioritize";

export type CheckState = "pending" | "running" | "done" | "failed";

export interface ScanProgress {
  crawl: CheckState;
  checks: Record<CheckId, { state: CheckState; result?: CheckResult }>;
  phase: "checks" | "fixkit" | "done";
}

const WAVE1: CheckId[] = ["gbp", "pagespeed", "serp", "ai-visibility"];
const WAVE2_CRAWL_ONLY: CheckId[] = ["indexability", "technical-seo", "structured-data"];
const WAVE2_CRAWL_GBP: CheckId[] = ["keywords", "nap-consistency"];
export const ALL_CHECKS: CheckId[] = [...WAVE1, ...WAVE2_CRAWL_ONLY, ...WAVE2_CRAWL_GBP];

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function errorResult(checkId: CheckId, err: unknown): CheckResult {
  return {
    checkId,
    status: "error",
    findings: [],
    note: err instanceof Error ? err.message : String(err),
    durationMs: 0,
  };
}

export async function runScan(
  input: ScanInput,
  onProgress: (p: ScanProgress) => void,
): Promise<ScanResult> {
  const progress: ScanProgress = {
    crawl: "running",
    checks: Object.fromEntries(ALL_CHECKS.map((id) => [id, { state: "pending" as CheckState }])) as ScanProgress["checks"],
    phase: "checks",
  };
  const emit = () => onProgress({ ...progress, checks: { ...progress.checks } });
  emit();

  const results: Partial<Record<CheckId, CheckResult>> = {};

  const runCheck = async (id: CheckId, extra: { crawl?: CrawlBundle; priorResults?: Partial<Record<CheckId, CheckResult>> } = {}) => {
    progress.checks[id] = { state: "running" };
    emit();
    try {
      const result = await post<CheckResult>(`/api/checks/${id}`, { scan: input, ...extra });
      results[id] = result;
      progress.checks[id] = { state: result.status === "error" ? "failed" : "done", result };
    } catch (err) {
      const result = errorResult(id, err);
      results[id] = result;
      progress.checks[id] = { state: "failed", result };
    }
    emit();
  };

  // Wave 1: crawl + independent checks in parallel
  const crawlPromise = post<CrawlBundle>("/api/checks/crawl", { websiteUrl: input.websiteUrl })
    .then((bundle) => {
      progress.crawl = "done";
      emit();
      return bundle;
    })
    .catch(() => {
      progress.crawl = "failed";
      emit();
      return undefined;
    });

  const gbpPromise = runCheck("gbp");
  const independents = WAVE1.filter((id) => id !== "gbp").map((id) => runCheck(id));

  // Wave 2a: crawl-dependent checks
  const crawl = await crawlPromise;
  await Promise.all([
    ...WAVE2_CRAWL_ONLY.map((id) => runCheck(id, { crawl })),
    // Wave 2b needs gbp result too
    gbpPromise.then(() =>
      Promise.all(
        WAVE2_CRAWL_GBP.map((id) => runCheck(id, { crawl, priorResults: { gbp: results.gbp } })),
      ),
    ),
    ...independents,
  ]);

  // Scoring + roadmap (pure, local)
  const dimensions = scoreDimensions(results);
  const overall = overallScore(dimensions);
  const roadmap = buildRoadmap(results);

  // Fix-It Kit
  progress.phase = "fixkit";
  emit();
  let fixKit: FixAsset[] = [];
  let narrative: ScanNarrative | undefined;
  try {
    const gbpRaw = results.gbp?.status === "ok" ? (results.gbp.raw as GbpData) : undefined;
    const dimensionSummary = dimensions
      .map((d) => `${DIMENSION_LABELS[d.dimension]}: ${d.score === null ? "manual" : d.score + "/100"}`)
      .join("\n");
    const kit = await post<{ fixKit: FixAsset[]; narrative?: ScanNarrative }>("/api/fixkit", {
      input,
      gbp: gbpRaw,
      crawl,
      roadmap,
      dimensionSummary,
    });
    fixKit = kit.fixKit;
    narrative = kit.narrative;
  } catch {
    // report ships without generated assets
  }

  progress.phase = "done";
  emit();

  return {
    version: 1,
    input,
    ranAt: new Date().toISOString(),
    checks: results,
    scores: { overall, dimensions },
    roadmap,
    fixKit,
    narrative,
  };
}
