import type { CrawlBundle, PageExtract } from "@/lib/types";
import { extractPage } from "./extract";

const UA =
  "Mozilla/5.0 (compatible; BrandPresenceScan/1.0; +https://github.com/dangalang28/hello-world)";
const MAX_PAGES = 8;
const TOTAL_BUDGET_MS = 20_000;
const PAGE_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 400_000;

const INTERESTING_PATHS =
  /\/(contact|about|services?|locations?|menu|pricing|team|reviews?|testimonials?)(\/|$|\.|-)/i;

async function fetchText(url: string, timeoutMs: number, accept = "text/html"): Promise<{ status: number; finalUrl: string; text: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const reader = res.body?.getReader();
    let text = "";
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        text += decoder.decode(value, { stream: true });
        if (bytes > MAX_HTML_BYTES) {
          reader.cancel().catch(() => {});
          break;
        }
      }
    }
    return { status: res.status, finalUrl: res.url || url, text };
  } catch {
    return null;
  }
}

function normalizeStartUrl(input: string): string {
  let u = input.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

export async function crawlSite(websiteUrl: string): Promise<CrawlBundle> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const startUrl = normalizeStartUrl(websiteUrl);
  const errors: string[] = [];
  const pages: PageExtract[] = [];

  const home = await fetchText(startUrl, PAGE_TIMEOUT_MS);
  if (!home || !home.text) {
    return {
      startUrl,
      finalOrigin: startUrl,
      pages: [],
      robotsTxt: { found: false, content: null, url: "" },
      sitemap: { found: false, url: null, urlCount: 0 },
      errors: [`Could not fetch ${startUrl}${home ? ` (HTTP ${home.status})` : " (network error or timeout)"}`],
    };
  }

  const homePage = extractPage(startUrl, home.finalUrl, home.status, home.text);
  pages.push(homePage);
  const origin = new URL(home.finalUrl).origin;

  // robots.txt + sitemap discovery (parallel)
  const [robotsRes, sitemapProbe] = await Promise.all([
    fetchText(`${origin}/robots.txt`, 5_000, "text/plain"),
    fetchText(`${origin}/sitemap.xml`, 5_000, "application/xml"),
  ]);

  const robotsContent = robotsRes && robotsRes.status === 200 ? robotsRes.text.slice(0, 20_000) : null;
  let sitemapUrl: string | null = null;
  let sitemapText: string | null = null;
  const robotsSitemap = robotsContent?.match(/^sitemap:\s*(\S+)/im)?.[1];
  if (sitemapProbe && sitemapProbe.status === 200 && sitemapProbe.text.includes("<")) {
    sitemapUrl = `${origin}/sitemap.xml`;
    sitemapText = sitemapProbe.text;
  } else if (robotsSitemap) {
    const alt = await fetchText(robotsSitemap, 5_000, "application/xml");
    if (alt && alt.status === 200) {
      sitemapUrl = robotsSitemap;
      sitemapText = alt.text;
    }
  }
  const sitemapUrls = sitemapText
    ? [...sitemapText.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1])
    : [];

  // Candidate pages: interesting internal links from home, then sitemap picks.
  const seen = new Set<string>([homePage.url, startUrl]);
  const candidates: string[] = [];
  const push = (u: string) => {
    try {
      const abs = new URL(u);
      abs.hash = "";
      const s = abs.toString();
      if (abs.origin !== origin || seen.has(s)) return;
      seen.add(s);
      candidates.push(s);
    } catch { /* skip */ }
  };
  homePage.internalLinks.filter((l) => INTERESTING_PATHS.test(l)).forEach(push);
  sitemapUrls.filter((l) => INTERESTING_PATHS.test(l)).slice(0, 5).forEach(push);
  sitemapUrls.slice(0, 5).forEach(push);

  for (const url of candidates.slice(0, MAX_PAGES - 1)) {
    if (Date.now() > deadline) {
      errors.push("Crawl time budget reached; some pages skipped.");
      break;
    }
    const res = await fetchText(url, PAGE_TIMEOUT_MS);
    if (!res) {
      errors.push(`Failed to fetch ${url}`);
      continue;
    }
    if (seen.has(res.finalUrl) && res.finalUrl !== url) continue;
    seen.add(res.finalUrl);
    pages.push(extractPage(url, res.finalUrl, res.status, res.text));
  }

  return {
    startUrl,
    finalOrigin: origin,
    pages,
    robotsTxt: { found: robotsContent !== null, content: robotsContent, url: `${origin}/robots.txt` },
    sitemap: { found: sitemapUrl !== null, url: sitemapUrl, urlCount: sitemapUrls.length },
    errors,
  };
}
