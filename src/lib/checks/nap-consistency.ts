import type { Finding, GbpData } from "@/lib/types";
import { addressesMatch, namesMatch, normalizePhone } from "@/lib/crawler/nap";
import { defineCheck, pass } from "./util";

export const napConsistencyCheck = defineCheck(
  { id: "nap-consistency", name: "Name / Address / Phone Consistency", dimension: "nap", requires: ["crawl", "gbp"] },
  async ({ scan, crawl, priorResults }) => {
    if (!crawl || crawl.pages.length === 0) {
      return { status: "error" as const, findings: [], note: "Site could not be crawled." };
    }

    const findings: Finding[] = [];
    const candidates = crawl.pages.flatMap((p) => p.napCandidates);
    const gbpResult = priorResults?.gbp;
    const gbp = gbpResult?.status === "ok" ? (gbpResult.raw as GbpData | undefined) : undefined;

    if (candidates.length === 0) {
      findings.push({
        id: "nap.none-on-site",
        dimension: "nap",
        severity: "warning",
        title: "No phone or address found on the website",
        evidence: `Checked footer, contact page, and schema across ${crawl.pages.length} pages.`,
        recommendation: "Display the business phone and address in the site footer and on the contact page — Google cross-references them with the Business Profile.",
        impact: 4,
        effort: 1,
        fixAssetRef: "fix.nap",
      });
      return { status: gbp ? ("ok" as const) : ("partial" as const), findings };
    }

    // Intra-site consistency
    const phones = [...new Set(candidates.map((c) => c.phoneNormalized).filter((p): p is string => Boolean(p)))];
    if (phones.length > 1) {
      const examples = phones.slice(0, 3).map((p) => {
        const c = candidates.find((x) => x.phoneNormalized === p)!;
        return `${c.phone} (${c.source} on ${c.pageUrl})`;
      });
      findings.push({
        id: "nap.phone-mismatch-site",
        dimension: "nap",
        severity: "warning",
        title: "Different phone numbers across the website",
        evidence: examples.join(" vs "),
        recommendation: "Standardize on one primary phone number everywhere.",
        impact: 4,
        effort: 1,
        fixAssetRef: "fix.nap",
      });
    }

    const addresses = candidates.map((c) => c.address).filter((a): a is string => Boolean(a));
    const distinctAddresses = addresses.filter((a, i) => addresses.findIndex((b) => addressesMatch(a, b)) === i);
    if (distinctAddresses.length > 1) {
      findings.push({
        id: "nap.address-mismatch-site",
        dimension: "nap",
        severity: "warning",
        title: "Different addresses across the website",
        evidence: distinctAddresses.slice(0, 2).map((a) => `\"${a}\"`).join(" vs "),
        recommendation: "Use one identical address format everywhere (match the Google Business Profile exactly).",
        impact: 4,
        effort: 1,
        fixAssetRef: "fix.nap",
      });
    }

    // Site vs GBP
    if (gbp) {
      if (gbp.phone && phones.length > 0 && !phones.includes(normalizePhone(gbp.phone))) {
        findings.push({
          id: "nap.phone-mismatch-gbp",
          dimension: "nap",
          severity: "critical",
          title: "Website phone doesn't match Google Business Profile",
          evidence: `Site: ${candidates.find((c) => c.phone)?.phone} — GBP: ${gbp.phone}`,
          recommendation: "Make the website and GBP phone identical; mismatches erode Google's confidence in the listing.",
          impact: 5,
          effort: 1,
          fixAssetRef: "fix.nap",
        });
      }
      if (gbp.formattedAddress && addresses.length > 0 && !addresses.some((a) => addressesMatch(a, gbp.formattedAddress!))) {
        findings.push({
          id: "nap.address-mismatch-gbp",
          dimension: "nap",
          severity: "critical",
          title: "Website address doesn't match Google Business Profile",
          evidence: `Site: \"${addresses[0]}\" — GBP: \"${gbp.formattedAddress}\"`,
          recommendation: "Align the website address exactly with the GBP address (same suite format, abbreviations, zip).",
          impact: 5,
          effort: 1,
          fixAssetRef: "fix.nap",
        });
      }
      const schemaName = candidates.find((c) => c.source === "jsonld" && c.name)?.name;
      if (schemaName && !namesMatch(schemaName, gbp.name)) {
        findings.push({
          id: "nap.name-mismatch",
          dimension: "nap",
          severity: "warning",
          title: "Business name differs between site schema and GBP",
          evidence: `Schema: \"${schemaName}\" — GBP: \"${gbp.name}\"`,
          recommendation: "Use one canonical business name across the site, schema, and GBP.",
          impact: 3,
          effort: 1,
        });
      }
    }

    const socials = [...new Set(crawl.pages.flatMap((p) => p.socialLinks))];
    if (socials.length === 0) {
      findings.push({
        id: "nap.no-socials",
        dimension: "nap",
        severity: "opportunity",
        title: "No social profiles linked from the website",
        evidence: "No Facebook/Instagram/LinkedIn/Yelp links found on crawled pages.",
        recommendation: "Link active social profiles (and add them to schema sameAs) — they corroborate the brand's identity.",
        impact: 2,
        effort: 1,
        fixAssetRef: "fix.jsonld",
      });
    }

    if (findings.length === 0) {
      findings.push(pass({
        id: "nap.ok",
        dimension: "nap",
        title: "NAP is consistent",
        evidence: gbp
          ? "Phone and address match across the site and the Google Business Profile."
          : "Phone and address are consistent across the website.",
      }));
    }

    return {
      status: gbp ? ("ok" as const) : ("partial" as const),
      findings,
      note: gbp ? undefined : "GBP data unavailable — scored on intra-site consistency only.",
    };
  },
);
