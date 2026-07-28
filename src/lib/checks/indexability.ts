import type { Finding } from "@/lib/types";
import { defineCheck, pass } from "./util";

export const indexabilityCheck = defineCheck(
  { id: "indexability", name: "Indexability", dimension: "technical", requires: ["crawl"] },
  async ({ crawl }) => {
    if (!crawl || crawl.pages.length === 0) {
      return {
        status: "error" as const,
        findings: [],
        note: "Site could not be crawled.",
        manualChecklist: [
          { step: "Open the site in a browser and confirm it loads.", lookFor: "Errors, redirects to a parked page, or bot blocking." },
          { step: "Search Google for site:yourdomain.com", lookFor: "Whether any pages are indexed at all." },
        ],
      };
    }

    const findings: Finding[] = [];
    const home = crawl.pages[0];

    // robots.txt
    if (!crawl.robotsTxt.found) {
      findings.push({
        id: "index.no-robots",
        dimension: "technical",
        severity: "opportunity",
        title: "No robots.txt file",
        evidence: `${crawl.robotsTxt.url} returned no usable robots.txt.`,
        recommendation: "Add a robots.txt that allows crawling and points to your sitemap.",
        impact: 2,
        effort: 1,
        fixAssetRef: "fix.robots",
      });
    } else {
      const content = crawl.robotsTxt.content ?? "";
      const blocksAll = /user-agent:\s*\*\s*(?:\r?\n(?!user-agent)[^\r\n]*)*?\r?\ndisallow:\s*\/\s*$/im.test(content);
      if (blocksAll) {
        findings.push({
          id: "index.robots-blocks-all",
          dimension: "technical",
          severity: "critical",
          title: "robots.txt blocks the entire site",
          evidence: `\"Disallow: /\" found for all user agents in ${crawl.robotsTxt.url}.`,
          evidenceUrl: crawl.robotsTxt.url,
          recommendation: "Remove the blanket Disallow rule so Google can crawl the site.",
          impact: 5,
          effort: 1,
          fixAssetRef: "fix.robots",
        });
      } else {
        findings.push(pass({ id: "index.robots-ok", dimension: "technical", title: "robots.txt allows crawling", evidence: crawl.robotsTxt.url }));
      }
    }

    // sitemap
    if (!crawl.sitemap.found) {
      findings.push({
        id: "index.no-sitemap",
        dimension: "technical",
        severity: "warning",
        title: "No XML sitemap found",
        evidence: `No sitemap at ${crawl.finalOrigin}/sitemap.xml and none referenced in robots.txt.`,
        recommendation: "Generate an XML sitemap, host it at /sitemap.xml, and submit it in Google Search Console.",
        impact: 3,
        effort: 2,
        fixAssetRef: "fix.sitemap",
      });
    } else {
      findings.push(pass({ id: "index.sitemap-ok", dimension: "technical", title: `XML sitemap found (${crawl.sitemap.urlCount} URLs)`, evidence: crawl.sitemap.url ?? "" }));
    }

    // per-page noindex / canonicals / status
    for (const page of crawl.pages) {
      if (page.metaRobots && /noindex/i.test(page.metaRobots)) {
        findings.push({
          id: "index.noindex",
          dimension: "technical",
          severity: page.url === home.url ? "critical" : "warning",
          title: "Page blocked from indexing (noindex)",
          evidence: `meta robots=\"${page.metaRobots}\" on ${page.url}`,
          evidenceUrl: page.url,
          recommendation: "Remove the noindex directive unless this page is intentionally hidden from Google.",
          impact: page.url === home.url ? 5 : 4,
          effort: 1,
        });
      }
      if (page.status >= 400) {
        findings.push({
          id: "index.http-error",
          dimension: "technical",
          severity: "warning",
          title: `Page returns HTTP ${page.status}`,
          evidence: `${page.requestedUrl} responded with status ${page.status}.`,
          evidenceUrl: page.requestedUrl,
          recommendation: "Fix or redirect broken pages; broken key pages waste crawl budget and lose visitors.",
          impact: 3,
          effort: 2,
        });
      }
      if (!page.canonical) {
        findings.push({
          id: "index.missing-canonical",
          dimension: "technical",
          severity: "opportunity",
          title: "Missing canonical tag",
          evidence: `No <link rel=\"canonical\"> on ${page.url}`,
          evidenceUrl: page.url,
          recommendation: "Add a self-referencing canonical tag to prevent duplicate-content dilution.",
          impact: 2,
          effort: 1,
        });
      } else {
        try {
          const canon = new URL(page.canonical, page.url);
          if (canon.origin !== new URL(page.url).origin) {
            findings.push({
              id: "index.foreign-canonical",
              dimension: "technical",
              severity: "critical",
              title: "Canonical points to a different domain",
              evidence: `${page.url} declares canonical ${page.canonical}`,
              evidenceUrl: page.url,
              recommendation: "Point the canonical back to this page unless the content genuinely lives elsewhere — a foreign canonical tells Google to rank the other site instead.",
              impact: 5,
              effort: 1,
            });
          }
        } catch { /* unparseable canonical */ }
      }
    }

    if (findings.every((f) => f.severity === "pass")) {
      findings.push(pass({ id: "index.all-ok", dimension: "technical", title: "All crawled pages are indexable", evidence: `${crawl.pages.length} pages checked.` }));
    }

    return { status: "ok" as const, findings };
  },
);
