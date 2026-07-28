import type { Finding, GbpData } from "@/lib/types";
import { defineCheck, pass } from "./util";

function humanizeCategory(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

export const keywordsCheck = defineCheck(
  { id: "keywords", name: "Keyword Opportunities", dimension: "keywords", requires: ["crawl", "gbp"] },
  async ({ scan, crawl, priorResults }) => {
    if (!crawl || crawl.pages.length === 0) {
      return { status: "error" as const, findings: [], note: "Site could not be crawled." };
    }

    const gbpResult = priorResults?.gbp;
    const gbp = gbpResult?.status === "ok" ? (gbpResult.raw as GbpData | undefined) : undefined;

    // Candidate service/category terms
    const terms = new Set<string>();
    if (scan.category) terms.add(scan.category.toLowerCase());
    for (const cat of gbp?.categories ?? []) {
      const h = humanizeCategory(cat).toLowerCase();
      if (h && h.split(" ").length <= 4) terms.add(h);
    }
    // Service-page slugs as service terms
    for (const page of crawl.pages) {
      const m = page.url.match(/\/services?\/([a-z0-9-]+)/i);
      if (m) terms.add(m[1].replace(/-/g, " ").toLowerCase());
    }

    if (terms.size === 0) {
      return {
        status: "manual" as const,
        findings: [],
        note: "No category or service terms could be derived (no category input, no GBP categories, no service pages).",
        manualChecklist: [
          { step: "List the 3–5 services customers actually pay for.", lookFor: "Each should become a target keyword like \"[service] in [city]\"." },
          { step: "Google each \"[service] [city]\" query.", lookFor: "Whether the brand appears at all in the local pack or organic results." },
        ],
      };
    }

    const findings: Finding[] = [];
    const city = scan.city?.trim();
    const pageMatches = (term: string) =>
      crawl.pages.some((p) => {
        const hay = [p.title ?? "", ...p.h1s, p.url].join(" ").toLowerCase();
        return hay.includes(term);
      });

    const uncovered: string[] = [];
    for (const term of [...terms].slice(0, 8)) {
      if (pageMatches(term)) continue;
      uncovered.push(term);
    }

    for (const term of uncovered.slice(0, 5)) {
      const target = city ? `${term} ${city}` : term;
      findings.push({
        id: "kw.no-page",
        dimension: "keywords",
        severity: "opportunity",
        title: `No dedicated page targeting \"${target}\"`,
        evidence: `None of the ${crawl.pages.length} crawled pages has \"${term}\" in its title, H1, or URL.`,
        recommendation: `Create (or retitle) a page targeting \"${target}\" — a focused page is the prerequisite for ranking on that search.`,
        impact: 4,
        effort: 3,
      });
    }

    const homeTitle = crawl.pages[0]?.title?.toLowerCase() ?? "";
    if (city && !homeTitle.includes(city.toLowerCase())) {
      findings.push({
        id: "kw.no-city-in-title",
        dimension: "keywords",
        severity: "opportunity",
        title: "Home page title doesn't mention the city",
        evidence: `Title: \"${crawl.pages[0]?.title ?? "(none)"}\"`,
        recommendation: `Include \"${city}\" in the home page title to reinforce local relevance.`,
        impact: 3,
        effort: 1,
        fixAssetRef: "fix.meta",
      });
    }

    if (findings.length === 0) {
      findings.push(pass({
        id: "kw.covered",
        dimension: "keywords",
        title: "Core service terms have dedicated pages",
        evidence: `Checked: ${[...terms].slice(0, 6).join(", ")}.`,
      }));
    }

    return {
      status: "ok" as const,
      findings,
      raw: { terms: [...terms], uncovered },
      note: "Heuristic coverage analysis. Connect a SERP provider to verify actual rankings.",
    };
  },
);
