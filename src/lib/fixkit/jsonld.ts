import type { CrawlBundle, FixAsset, GbpData, ScanInput } from "@/lib/types";

/** Builds paste-ready LocalBusiness JSON-LD from GBP data, falling back to site data. */
export function buildJsonLdAsset(
  input: ScanInput,
  gbp: GbpData | undefined,
  crawl: CrawlBundle | undefined,
): FixAsset {
  const home = crawl?.pages[0];
  const siteNap = crawl?.pages.flatMap((p) => p.napCandidates).find((c) => c.phone || c.address);
  const socials = [...new Set(crawl?.pages.flatMap((p) => p.socialLinks) ?? [])];

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: gbp?.name ?? input.brandName,
    url: crawl?.finalOrigin ?? input.websiteUrl,
  };
  const phone = gbp?.phone ?? siteNap?.phone;
  if (phone) schema.telephone = phone;
  const address = gbp?.formattedAddress ?? siteNap?.address;
  if (address) schema.address = address;
  if (gbp?.rating !== undefined && gbp.reviewCount !== undefined && gbp.reviewCount > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: gbp.rating,
      reviewCount: gbp.reviewCount,
    };
  }
  if (gbp?.mapsUrl || socials.length > 0) {
    schema.sameAs = [gbp?.mapsUrl, ...socials].filter(Boolean);
  }
  if (home?.ogTags["og:image"]) schema.image = home.ogTags["og:image"];
  if (input.category) schema.description = `${input.brandName} — ${input.category}${input.city ? ` in ${input.city}` : ""}.`;

  const content = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;

  return {
    id: "fix.jsonld",
    kind: "jsonld",
    title: "LocalBusiness schema (paste into the home page <head>)",
    content,
    format: "html",
    appliesTo: crawl?.finalOrigin ?? input.websiteUrl,
    generatedBy: "deterministic",
  };
}
