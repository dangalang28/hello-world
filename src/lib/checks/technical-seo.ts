import type { Finding } from "@/lib/types";
import { defineCheck, pass } from "./util";

export const technicalSeoCheck = defineCheck(
  { id: "technical-seo", name: "On-Page Technical SEO", dimension: "technical", requires: ["crawl"] },
  async ({ crawl }) => {
    if (!crawl || crawl.pages.length === 0) {
      return { status: "error" as const, findings: [], note: "Site could not be crawled." };
    }

    const findings: Finding[] = [];
    const home = crawl.pages[0];

    if (!home.https) {
      findings.push({
        id: "tech.no-https",
        dimension: "technical",
        severity: "critical",
        title: "Site is not served over HTTPS",
        evidence: `Final URL: ${home.url}`,
        recommendation: "Install an SSL certificate and redirect all HTTP traffic to HTTPS. Google flags non-HTTPS sites as \"Not secure\".",
        impact: 5,
        effort: 2,
      });
    }

    const seenTitles = new Map<string, string>();
    for (const page of crawl.pages) {
      if (page.status >= 400) continue;
      const isHome = page.url === home.url;

      if (!page.title) {
        findings.push({
          id: "tech.missing-title",
          dimension: "technical",
          severity: isHome ? "critical" : "warning",
          title: "Missing page title",
          evidence: `No <title> on ${page.url}`,
          evidenceUrl: page.url,
          recommendation: "Write a unique, descriptive title (50–60 characters) including the brand and primary service.",
          impact: isHome ? 5 : 4,
          effort: 1,
          fixAssetRef: "fix.meta",
        });
      } else {
        if (page.title.length > 65) {
          findings.push({
            id: "tech.long-title",
            dimension: "technical",
            severity: "opportunity",
            title: "Title likely truncated in search results",
            evidence: `\"${page.title}\" (${page.title.length} chars) on ${page.url}`,
            evidenceUrl: page.url,
            recommendation: "Shorten the title to about 60 characters so it displays fully.",
            impact: 2,
            effort: 1,
            fixAssetRef: "fix.meta",
          });
        }
        const prior = seenTitles.get(page.title);
        if (prior && prior !== page.url) {
          findings.push({
            id: "tech.duplicate-title",
            dimension: "technical",
            severity: "warning",
            title: "Duplicate page titles",
            evidence: `\"${page.title}\" used on both ${prior} and ${page.url}`,
            recommendation: "Give every page a unique title describing its specific content.",
            impact: 3,
            effort: 2,
            fixAssetRef: "fix.meta",
          });
        }
        seenTitles.set(page.title, page.url);
      }

      if (!page.metaDescription) {
        findings.push({
          id: "tech.missing-description",
          dimension: "technical",
          severity: "warning",
          title: "Missing meta description",
          evidence: `No meta description on ${page.url}`,
          evidenceUrl: page.url,
          recommendation: "Write a 150–160 character description that sells the click — Google often shows it under your title.",
          impact: 3,
          effort: 1,
          fixAssetRef: "fix.meta",
        });
      }

      if (page.h1s.length === 0) {
        findings.push({
          id: "tech.missing-h1",
          dimension: "technical",
          severity: "warning",
          title: "Missing H1 heading",
          evidence: `No <h1> on ${page.url}`,
          evidenceUrl: page.url,
          recommendation: "Add a single H1 stating what the page is about.",
          impact: 3,
          effort: 1,
        });
      } else if (page.h1s.length > 1) {
        findings.push({
          id: "tech.multiple-h1",
          dimension: "technical",
          severity: "opportunity",
          title: "Multiple H1 headings",
          evidence: `${page.h1s.length} H1s on ${page.url}: ${page.h1s.slice(0, 3).map((h) => `\"${h}\"`).join(", ")}`,
          evidenceUrl: page.url,
          recommendation: "Keep one H1 per page; demote the rest to H2.",
          impact: 1,
          effort: 1,
        });
      }

      if (isHome && !page.ogTags["og:title"]) {
        findings.push({
          id: "tech.missing-og",
          dimension: "technical",
          severity: "opportunity",
          title: "Missing Open Graph tags",
          evidence: `No og:title on ${page.url} — link shares on social/messaging apps render without a preview.`,
          evidenceUrl: page.url,
          recommendation: "Add og:title, og:description, and og:image so shared links look credible.",
          impact: 2,
          effort: 1,
          fixAssetRef: "fix.meta",
        });
      }
    }

    if (findings.length === 0) {
      findings.push(pass({ id: "tech.all-ok", dimension: "technical", title: "On-page fundamentals look solid", evidence: `${crawl.pages.length} pages checked: titles, descriptions, H1s, HTTPS all present.` }));
    }

    return { status: "ok" as const, findings };
  },
);
