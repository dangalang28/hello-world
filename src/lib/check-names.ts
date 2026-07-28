import type { CheckId } from "@/lib/types";

// Display names duplicated from the registry so client pages never import
// check modules (which pull in server-only deps like cheerio).
export const CHECK_NAMES: Record<CheckId, string> = {
  indexability: "Indexability",
  "technical-seo": "On-Page Technical SEO",
  "structured-data": "Structured Data",
  pagespeed: "Speed & Mobile Experience",
  gbp: "Google Business Profile",
  "nap-consistency": "Name / Address / Phone Consistency",
  keywords: "Keyword Opportunities",
  serp: "Branded Search Results",
  "ai-visibility": "AI Search Visibility",
};
