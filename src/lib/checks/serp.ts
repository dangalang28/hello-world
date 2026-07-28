import type { Finding } from "@/lib/types";
import { getSerpProvider } from "@/lib/serp/provider";
import { defineCheck, pass } from "./util";

export const serpCheck = defineCheck(
  { id: "serp", name: "Branded Search Results", dimension: "serp", requires: [] },
  async ({ scan }) => {
    const provider = getSerpProvider();
    const query = scan.brandName + (scan.city ? ` ${scan.city}` : "");
    const response = await provider.search(query);

    if (!response.available) {
      return {
        status: "manual" as const,
        findings: [],
        note: response.reason,
        manualChecklist: [
          { step: `In an incognito window, Google \"${scan.brandName}\"${scan.city ? ` and \"${scan.brandName} ${scan.city}\"` : ""}.`, lookFor: "Is the official website the #1 organic result?" },
          { step: "Check the right-hand side (desktop) or top (mobile).", lookFor: "Does the Google Business Profile knowledge panel appear for the brand?" },
          { step: "Scan the rest of page one.", lookFor: "Directories (Yelp, YellowPages), competitors, or negative results ranking above brand-owned pages." },
          { step: "Count brand-owned results on page one.", lookFor: "Website, GBP, social profiles — fewer than 4 owned results means competitors/aggregators own the brand's narrative." },
          { step: `Ask Google \"${scan.brandName} reviews\".`, lookFor: "Which review platforms surface, and their ratings." },
        ],
      };
    }

    // Real scoring branch — active once a SerpProvider is configured.
    const findings: Finding[] = [];
    const brandDomain = (() => {
      try {
        return new URL(/^https?:\/\//.test(scan.websiteUrl) ? scan.websiteUrl : "https://" + scan.websiteUrl).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();

    const top = response.results.slice(0, 10);
    const ownedPositions = top.filter((r) => r.domain.replace(/^www\./, "").endsWith(brandDomain)).map((r) => r.position);

    if (!ownedPositions.includes(1)) {
      findings.push({
        id: "serp.not-first",
        dimension: "serp",
        severity: "critical",
        title: "Official site is not the #1 branded result",
        evidence: `Top result for \"${response.query}\": ${top[0]?.url ?? "unknown"}.`,
        recommendation: "Strengthen brand signals: Organization schema, consistent NAP, GBP linking, and authoritative profiles.",
        impact: 5,
        effort: 3,
      });
    }
    if (ownedPositions.length < 4) {
      findings.push({
        id: "serp.low-ownership",
        dimension: "serp",
        severity: "warning",
        title: `Brand owns only ${ownedPositions.length} of the top 10 branded results`,
        evidence: top.map((r) => `#${r.position} ${r.domain}`).join(", "),
        recommendation: "Claim and optimize profiles (GBP, social, directories) so brand-controlled pages fill page one.",
        impact: 4,
        effort: 3,
      });
    }
    if (response.knowledgePanel === false) {
      findings.push({
        id: "serp.no-knowledge-panel",
        dimension: "serp",
        severity: "warning",
        title: "No knowledge panel on branded search",
        evidence: `No Business Profile panel appeared for \"${response.query}\".`,
        recommendation: "Verify the GBP and add Organization schema so Google connects the brand entity.",
        impact: 4,
        effort: 2,
      });
    }
    if (findings.length === 0) {
      findings.push(pass({ id: "serp.ok", dimension: "serp", title: "Brand owns its branded search results", evidence: `${ownedPositions.length} of top 10 results are brand-controlled.` }));
    }

    return { status: "ok" as const, findings, raw: { query: response.query, top } };
  },
);
