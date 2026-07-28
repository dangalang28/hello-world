/**
 * Live smoke test: runs the crawl + crawl-dependent checks against real sites
 * and prints a score summary. Usage:
 *   npx tsx scripts/smoke.ts https://example-business.com "Brand Name" "City"
 */
import { crawlSite } from "../src/lib/crawler/crawl";
import { indexabilityCheck } from "../src/lib/checks/indexability";
import { technicalSeoCheck } from "../src/lib/checks/technical-seo";
import { structuredDataCheck } from "../src/lib/checks/structured-data";
import { napConsistencyCheck } from "../src/lib/checks/nap-consistency";
import { keywordsCheck } from "../src/lib/checks/keywords";
import { scoreDimensions, overallScore, DIMENSION_LABELS } from "../src/lib/scoring/score";
import { buildRoadmap } from "../src/lib/scoring/prioritize";
import type { CheckId, CheckResult, ScanInput } from "../src/lib/types";

async function main() {
  const [url, brandName = "Unknown Brand", city] = process.argv.slice(2);
  if (!url) {
    console.error("usage: npx tsx scripts/smoke.ts <url> [brand] [city]");
    process.exit(1);
  }
  const scan: ScanInput = { brandName, websiteUrl: url, city };

  console.log(`Crawling ${url} …`);
  const crawl = await crawlSite(url);
  console.log(`  pages: ${crawl.pages.map((p) => p.url).join(", ") || "(none)"}`);
  console.log(`  robots: ${crawl.robotsTxt.found}, sitemap: ${crawl.sitemap.found} (${crawl.sitemap.urlCount} urls)`);
  if (crawl.errors.length) console.log(`  errors: ${crawl.errors.join("; ")}`);

  const results: Partial<Record<CheckId, CheckResult>> = {};
  for (const check of [indexabilityCheck, technicalSeoCheck, structuredDataCheck, napConsistencyCheck, keywordsCheck]) {
    const r = await check.run({ scan, crawl, priorResults: results });
    results[check.id] = r;
    const actionable = r.findings.filter((f) => f.severity !== "pass" && f.severity !== "info");
    console.log(`\n${check.name} [${r.status}] — ${actionable.length} issue(s)`);
    for (const f of actionable) console.log(`  [${f.severity}] ${f.title}`);
  }

  const dims = scoreDimensions(results);
  console.log("\n--- Scores ---");
  for (const d of dims) {
    if (d.score !== null) console.log(`${DIMENSION_LABELS[d.dimension]}: ${d.score}/100`);
  }
  console.log(`Overall (crawl-based dims only): ${overallScore(dims)}`);

  console.log("\n--- Roadmap ---");
  for (const item of buildRoadmap(results, 5)) {
    console.log(`${item.rank}. [${item.finding.severity}] ${item.finding.title} (priority ${item.priorityScore.toFixed(1)})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
