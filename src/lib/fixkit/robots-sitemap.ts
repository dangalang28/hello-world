import type { CrawlBundle, FixAsset } from "@/lib/types";

export function buildRobotsAsset(crawl: CrawlBundle | undefined): FixAsset | null {
  if (!crawl) return null;
  const origin = crawl.finalOrigin;
  const robotsProblem =
    !crawl.robotsTxt.found ||
    /user-agent:\s*\*[\s\S]{0,200}?disallow:\s*\/\s*$/im.test(crawl.robotsTxt.content ?? "");
  if (!robotsProblem) return null;

  return {
    id: "fix.robots",
    kind: "robots",
    title: "Recommended robots.txt",
    content: `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml`,
    format: "text",
    appliesTo: `${origin}/robots.txt`,
    generatedBy: "deterministic",
  };
}

export function buildSitemapNoteAsset(crawl: CrawlBundle | undefined): FixAsset | null {
  if (!crawl || crawl.sitemap.found) return null;
  return {
    id: "fix.sitemap",
    kind: "sitemap-note",
    title: "Sitemap setup instructions",
    content: [
      `This site has no XML sitemap. To fix:`,
      ``,
      `1. Generate one — most CMSs do this automatically:`,
      `   • WordPress: install Yoast SEO or Rank Math (sitemap is enabled by default)`,
      `   • Squarespace/Wix/Shopify: already served at /sitemap.xml (verify it loads)`,
      `   • Static/custom site: generate with a crawler tool and upload to ${crawl.finalOrigin}/sitemap.xml`,
      `2. Reference it in robots.txt:  Sitemap: ${crawl.finalOrigin}/sitemap.xml`,
      `3. Submit it in Google Search Console → Sitemaps.`,
    ].join("\n"),
    format: "text",
    appliesTo: `${crawl.finalOrigin}/sitemap.xml`,
    generatedBy: "deterministic",
  };
}
