import * as cheerio from "cheerio";
import type { NapCandidate, PageExtract } from "@/lib/types";
import { extractAddresses, extractPhones, normalizePhone } from "./nap";

const SOCIAL_HOSTS = [
  "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com",
  "youtube.com", "tiktok.com", "yelp.com", "pinterest.com",
];

export function extractPage(requestedUrl: string, finalUrl: string, status: number, html: string): PageExtract {
  const $ = cheerio.load(html);
  const url = new URL(finalUrl);

  const jsonLd: unknown[] = [];
  let jsonLdErrors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).text();
    try {
      const parsed = JSON.parse(text);
      // flatten @graph and arrays into individual entities
      const items = Array.isArray(parsed) ? parsed : parsed["@graph"] ?? [parsed];
      jsonLd.push(...(Array.isArray(items) ? items : [items]));
    } catch {
      jsonLdErrors++;
    }
  });

  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property");
    const content = $(el).attr("content");
    if (prop && content) ogTags[prop] = content;
  });

  const internalLinks: string[] = [];
  const socialLinks: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, finalUrl);
      if (abs.host === url.host && (abs.protocol === "http:" || abs.protocol === "https:")) {
        abs.hash = "";
        internalLinks.push(abs.toString());
      } else if (SOCIAL_HOSTS.some((h) => abs.hostname === h || abs.hostname.endsWith("." + h))) {
        socialLinks.push(abs.toString());
      }
    } catch {
      /* unparseable href */
    }
  });

  $("script, style, noscript, svg").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const footerText = $("footer").text().replace(/\s+/g, " ").trim();

  const napCandidates = extractNapCandidates(finalUrl, bodyText, footerText, jsonLd);

  return {
    url: finalUrl,
    requestedUrl,
    status,
    title: $("head title").first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr("content")?.trim() || null,
    metaRobots: $('meta[name="robots"]').attr("content")?.trim() || null,
    canonical: $('link[rel="canonical"]').attr("href")?.trim() || null,
    h1s: $("h1").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get().filter(Boolean),
    ogTags,
    jsonLd,
    jsonLdErrors,
    napCandidates,
    socialLinks: [...new Set(socialLinks)],
    internalLinks: [...new Set(internalLinks)].slice(0, 200),
    textSample: bodyText.slice(0, 2000),
    https: url.protocol === "https:",
  };
}

function extractNapCandidates(
  pageUrl: string,
  bodyText: string,
  footerText: string,
  jsonLd: unknown[],
): NapCandidate[] {
  const out: NapCandidate[] = [];
  const isContact = /contact/i.test(pageUrl);

  const fromText = (source: string, text: string) => {
    const phones = extractPhones(text);
    const addresses = extractAddresses(text);
    if (phones.length === 0 && addresses.length === 0) return;
    out.push({
      source,
      pageUrl,
      phone: phones[0],
      phoneNormalized: phones[0] ? normalizePhone(phones[0]) : undefined,
      address: addresses[0],
    });
  };

  if (footerText) fromText("footer", footerText);
  if (isContact) fromText("contact-page", bodyText);

  for (const entity of jsonLd) {
    if (typeof entity !== "object" || entity === null) continue;
    const e = entity as Record<string, unknown>;
    const type = String(e["@type"] ?? "");
    if (!/Organization|LocalBusiness|Store|Restaurant|Dentist|Attorney|Plumber|Electrician|HomeAndConstructionBusiness|ProfessionalService|MedicalBusiness/i.test(type)) continue;
    const addr = e.address as Record<string, unknown> | string | undefined;
    const addressStr =
      typeof addr === "string"
        ? addr
        : addr
          ? [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode]
              .filter(Boolean)
              .join(", ")
          : undefined;
    const phone = typeof e.telephone === "string" ? e.telephone : undefined;
    if (!addressStr && !phone && !e.name) continue;
    out.push({
      source: "jsonld",
      pageUrl,
      name: typeof e.name === "string" ? e.name : undefined,
      phone,
      phoneNormalized: phone ? normalizePhone(phone) : undefined,
      address: addressStr,
    });
  }

  return out;
}
