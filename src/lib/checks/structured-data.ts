import type { Finding } from "@/lib/types";
import { defineCheck, pass } from "./util";

const ORG_TYPES =
  /Organization|LocalBusiness|Store|Restaurant|Dentist|Attorney|Plumber|Electrician|HomeAndConstructionBusiness|ProfessionalService|MedicalBusiness|AutoRepair|HairSalon|LegalService|FinancialService/i;

function typesOf(entity: unknown): string[] {
  if (typeof entity !== "object" || entity === null) return [];
  const t = (entity as Record<string, unknown>)["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

export const structuredDataCheck = defineCheck(
  { id: "structured-data", name: "Structured Data", dimension: "structured-data", requires: ["crawl"] },
  async ({ crawl }) => {
    if (!crawl || crawl.pages.length === 0) {
      return { status: "error" as const, findings: [], note: "Site could not be crawled." };
    }

    const findings: Finding[] = [];
    const allEntities = crawl.pages.flatMap((p) => p.jsonLd);
    const allTypes = allEntities.flatMap(typesOf);
    const parseErrors = crawl.pages.reduce((n, p) => n + p.jsonLdErrors, 0);

    if (parseErrors > 0) {
      findings.push({
        id: "sd.parse-errors",
        dimension: "structured-data",
        severity: "warning",
        title: "Broken JSON-LD blocks",
        evidence: `${parseErrors} JSON-LD script block(s) failed to parse across crawled pages.`,
        recommendation: "Fix the JSON syntax — broken blocks are ignored by Google entirely.",
        impact: 3,
        effort: 2,
      });
    }

    const orgEntity = allEntities.find((e) => typesOf(e).some((t) => ORG_TYPES.test(t)));
    if (!orgEntity) {
      findings.push({
        id: "sd.no-organization",
        dimension: "structured-data",
        severity: "critical",
        title: "No Organization/LocalBusiness schema",
        evidence: allEntities.length === 0
          ? "No JSON-LD structured data found on any crawled page."
          : `JSON-LD present (${[...new Set(allTypes)].slice(0, 5).join(", ")}) but no Organization or LocalBusiness entity.`,
        recommendation: "Add LocalBusiness JSON-LD to the home page so Google can confidently connect the site to the business identity, hours, and location.",
        impact: 5,
        effort: 2,
        fixAssetRef: "fix.jsonld",
      });
    } else {
      const e = orgEntity as Record<string, unknown>;
      const missing: string[] = [];
      if (!e.name) missing.push("name");
      if (!e.address) missing.push("address");
      if (!e.telephone) missing.push("telephone");
      if (!e.url) missing.push("url");
      if (missing.length > 0) {
        findings.push({
          id: "sd.incomplete-organization",
          dimension: "structured-data",
          severity: "warning",
          title: "Business schema is incomplete",
          evidence: `${typesOf(orgEntity)[0]} entity found but missing: ${missing.join(", ")}.`,
          recommendation: "Fill in the missing properties so the schema fully describes the business.",
          impact: 3,
          effort: 1,
          fixAssetRef: "fix.jsonld",
        });
      } else {
        findings.push(pass({ id: "sd.organization-ok", dimension: "structured-data", title: `${typesOf(orgEntity)[0]} schema present and complete`, evidence: "name, address, telephone, and url all set." }));
      }
    }

    if (!allTypes.some((t) => /AggregateRating|Review/i.test(t))) {
      findings.push({
        id: "sd.no-reviews",
        dimension: "structured-data",
        severity: "opportunity",
        title: "No review/rating schema",
        evidence: "No AggregateRating or Review entities found.",
        recommendation: "If you display genuine customer reviews on the site, mark them up to become eligible for star ratings in search results.",
        impact: 3,
        effort: 2,
      });
    }

    if (!allTypes.some((t) => /Service|Product|Menu|Offer/i.test(t))) {
      findings.push({
        id: "sd.no-services",
        dimension: "structured-data",
        severity: "opportunity",
        title: "No Service/Product schema",
        evidence: "No Service, Product, or Offer entities found on crawled pages.",
        recommendation: "Add Service schema to each service page so Google understands exactly what the business offers.",
        impact: 2,
        effort: 2,
        fixAssetRef: "fix.jsonld",
      });
    }

    return { status: "ok" as const, findings };
  },
);
