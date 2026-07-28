import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPage } from "@/lib/crawler/extract";
import { indexabilityCheck } from "@/lib/checks/indexability";
import { technicalSeoCheck } from "@/lib/checks/technical-seo";
import { structuredDataCheck } from "@/lib/checks/structured-data";
import { napConsistencyCheck } from "@/lib/checks/nap-consistency";
import type { CrawlBundle, ScanInput } from "@/lib/types";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "..", "fixtures", "sample-site", name), "utf8");

const scan: ScanInput = { brandName: "Acme Plumbing", websiteUrl: "https://acmeplumbing.example", city: "Austin" };

function bundleFrom(html: string, opts: Partial<CrawlBundle> = {}): CrawlBundle {
  const page = extractPage("https://acmeplumbing.example/", "https://acmeplumbing.example/", 200, html);
  return {
    startUrl: "https://acmeplumbing.example/",
    finalOrigin: "https://acmeplumbing.example",
    pages: [page],
    robotsTxt: { found: true, content: "User-agent: *\nAllow: /", url: "https://acmeplumbing.example/robots.txt" },
    sitemap: { found: true, url: "https://acmeplumbing.example/sitemap.xml", urlCount: 10 },
    errors: [],
    ...opts,
  };
}

describe("defective site fixture", () => {
  const crawl = bundleFrom(fixture("defective-home.html"));
  const contactPage = extractPage(
    "https://acmeplumbing.example/contact",
    "https://acmeplumbing.example/contact",
    200,
    fixture("defective-contact.html"),
  );
  const crawlWithContact: CrawlBundle = { ...crawl, pages: [...crawl.pages, contactPage] };

  it("indexability flags missing canonical", async () => {
    const result = await indexabilityCheck.run({ scan, crawl });
    expect(result.findings.map((f) => f.id)).toContain("index.missing-canonical");
  });

  it("technical-seo flags long title, missing description, multiple h1s, missing og", async () => {
    const result = await technicalSeoCheck.run({ scan, crawl });
    const ids = result.findings.map((f) => f.id);
    expect(ids).toContain("tech.long-title");
    expect(ids).toContain("tech.missing-description");
    expect(ids).toContain("tech.multiple-h1");
    expect(ids).toContain("tech.missing-og");
  });

  it("structured-data flags broken JSON-LD and missing organization", async () => {
    const result = await structuredDataCheck.run({ scan, crawl });
    const ids = result.findings.map((f) => f.id);
    expect(ids).toContain("sd.parse-errors");
    expect(ids).toContain("sd.no-organization");
  });

  it("nap-consistency flags conflicting phone numbers on the site", async () => {
    const result = await napConsistencyCheck.run({ scan, crawl: crawlWithContact });
    const ids = result.findings.map((f) => f.id);
    expect(ids).toContain("nap.phone-mismatch-site");
    expect(result.status).toBe("partial"); // no GBP data provided
  });
});

describe("clean site fixture", () => {
  const crawl = bundleFrom(fixture("clean-home.html"));

  it("indexability passes", async () => {
    const result = await indexabilityCheck.run({ scan, crawl });
    const actionable = result.findings.filter((f) => f.severity !== "pass" && f.severity !== "info");
    expect(actionable).toEqual([]);
  });

  it("technical-seo passes", async () => {
    const result = await technicalSeoCheck.run({ scan, crawl });
    const actionable = result.findings.filter((f) => f.severity !== "pass" && f.severity !== "info");
    expect(actionable).toEqual([]);
  });

  it("structured-data finds complete LocalBusiness", async () => {
    const result = await structuredDataCheck.run({ scan, crawl });
    const ids = result.findings.map((f) => f.id);
    expect(ids).toContain("sd.organization-ok");
    expect(ids).not.toContain("sd.no-organization");
  });

  it("robots blocking everything is critical", async () => {
    const blocked = bundleFrom(fixture("clean-home.html"), {
      robotsTxt: { found: true, content: "User-agent: *\nDisallow: /", url: "https://acmeplumbing.example/robots.txt" },
    });
    const result = await indexabilityCheck.run({ scan, crawl: blocked });
    expect(result.findings.map((f) => f.id)).toContain("index.robots-blocks-all");
  });
});
