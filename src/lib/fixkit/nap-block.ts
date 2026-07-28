import type { CrawlBundle, FixAsset, GbpData, ScanInput } from "@/lib/types";

/** Canonical NAP block for the site footer — matches the GBP exactly when available. */
export function buildNapBlockAsset(
  input: ScanInput,
  gbp: GbpData | undefined,
  crawl: CrawlBundle | undefined,
): FixAsset | null {
  const siteNap = crawl?.pages.flatMap((p) => p.napCandidates).find((c) => c.phone || c.address);
  const name = gbp?.name ?? input.brandName;
  const phone = gbp?.phone ?? siteNap?.phone;
  const address = gbp?.formattedAddress ?? siteNap?.address;
  if (!phone && !address) return null;

  const telHref = phone ? `tel:+1${phone.replace(/\D/g, "").replace(/^1/, "")}` : "";
  const lines = [
    `<div class="business-nap" itemscope itemtype="https://schema.org/LocalBusiness">`,
    `  <strong itemprop="name">${name}</strong><br>`,
    ...(address ? [`  <span itemprop="address">${address}</span><br>`] : []),
    ...(phone ? [`  <a itemprop="telephone" href="${telHref}">${phone}</a>`] : []),
    `</div>`,
  ];

  return {
    id: "fix.nap",
    kind: "nap-block",
    title: "Canonical NAP block (use this exact text in the footer and contact page)",
    content: lines.join("\n"),
    format: "html",
    appliesTo: "Site footer + contact page",
    generatedBy: "deterministic",
  };
}
