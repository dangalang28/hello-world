import type { Finding, GbpData, ManualStep } from "@/lib/types";
import { namesMatch } from "@/lib/crawler/nap";
import { defineCheck, pass } from "./util";

const GBP_MANUAL: ManualStep[] = [
  { step: "Search the brand name + city on Google Maps.", lookFor: "Does a Business Profile appear at all? Is it claimed (\"Own this business?\" link means unclaimed)?" },
  { step: "Open the profile and review every field.", lookFor: "Missing hours, website link, phone, services, description, or attributes." },
  { step: "Count photos and check their age.", lookFor: "Fewer than 10 photos, or nothing added in the last 6 months." },
  { step: "Read the last 10 reviews.", lookFor: "Rating below 4.0, unanswered negative reviews, or fewer than 10 total reviews." },
  { step: "Compare the listed category to top-ranking competitors.", lookFor: "A generic primary category where competitors use a more specific one." },
];

async function placesFetch(url: string, key: string, fieldMask: string): Promise<Record<string, any> | null> {
  const res = await fetch(url, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": fieldMask },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return res.json();
}

export const gbpCheck = defineCheck(
  { id: "gbp", name: "Google Business Profile", dimension: "gbp", requires: [] },
  async ({ scan }) => {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) {
      return {
        status: "manual" as const,
        findings: [],
        note: "GOOGLE_API_KEY not configured — GBP audited via manual checklist.",
        manualChecklist: GBP_MANUAL,
      };
    }

    const fieldMask = [
      "id", "displayName", "formattedAddress", "nationalPhoneNumber", "websiteUri",
      "rating", "userRatingCount", "types", "primaryTypeDisplayName", "regularOpeningHours",
      "photos", "businessStatus", "googleMapsUri",
    ].map((f) => (f === "id" || f === "displayName" ? f : f)).join(",");

    let place: Record<string, any> | null = null;
    let ambiguous = false;

    if (scan.gbpHint?.trim().startsWith("ChIJ") || scan.gbpHint?.trim().startsWith("places/")) {
      const id = scan.gbpHint.trim().replace(/^places\//, "");
      place = await placesFetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
        key,
        fieldMask,
      );
    } else {
      const query = [scan.gbpHint || scan.brandName, scan.city].filter(Boolean).join(" ");
      const searchMask = fieldMask.split(",").map((f) => `places.${f}`).join(",");
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": searchMask,
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 3 }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { places?: Record<string, any>[] };
        const places = json.places ?? [];
        place = places[0] ?? null;
        if (place && places.length > 1 && !namesMatch(place.displayName?.text ?? "", scan.brandName)) {
          ambiguous = true;
        }
      } else {
        const body = await res.text().catch(() => "");
        return {
          status: "manual" as const,
          findings: [],
          note: `Places API error (HTTP ${res.status}): ${body.slice(0, 200)}`,
          manualChecklist: GBP_MANUAL,
        };
      }
    }

    if (!place) {
      return {
        status: "ok" as const,
        findings: [
          {
            id: "gbp.not-found",
            dimension: "gbp",
            severity: "critical",
            title: "No Google Business Profile found",
            evidence: `Places search for \"${scan.brandName}${scan.city ? " " + scan.city : ""}\" returned no listing.`,
            recommendation: "Create and verify a Google Business Profile — it is the single highest-impact free asset for local visibility.",
            impact: 5,
            effort: 3,
          } satisfies Finding,
        ],
      };
    }

    const gbp: GbpData = {
      placeId: place.id ?? "",
      name: place.displayName?.text ?? "",
      formattedAddress: place.formattedAddress,
      phone: place.nationalPhoneNumber,
      website: place.websiteUri,
      rating: place.rating,
      reviewCount: place.userRatingCount,
      categories: [place.primaryTypeDisplayName?.text, ...(place.types ?? [])].filter(
        (c): c is string => typeof c === "string" && !/point_of_interest|establishment/.test(c),
      ),
      hasHours: Boolean(place.regularOpeningHours),
      photoCount: (place.photos ?? []).length,
      businessStatus: place.businessStatus,
      mapsUrl: place.googleMapsUri,
    };

    const findings: Finding[] = [];

    if (ambiguous) {
      findings.push({
        id: "gbp.ambiguous-match",
        dimension: "gbp",
        severity: "info",
        title: "Confirm listing match",
        evidence: `Best match was \"${gbp.name}\" — multiple candidates returned; verify this is the right profile.`,
        recommendation: "Re-run the scan with the exact Place ID if this is the wrong listing.",
        impact: 1,
        effort: 1,
      });
    }

    if (!gbp.website) {
      findings.push({
        id: "gbp.no-website",
        dimension: "gbp",
        severity: "critical",
        title: "Profile has no website link",
        evidence: `The listing \"${gbp.name}\" has no website set.`,
        recommendation: "Add the website URL to the profile — it is a direct traffic and trust signal.",
        impact: 5,
        effort: 1,
      });
    }
    if (!gbp.phone) {
      findings.push({
        id: "gbp.no-phone",
        dimension: "gbp",
        severity: "warning",
        title: "Profile has no phone number",
        evidence: `No phone number on the listing.`,
        recommendation: "Add the primary business phone so mobile searchers can tap to call.",
        impact: 4,
        effort: 1,
      });
    }
    if (!gbp.hasHours) {
      findings.push({
        id: "gbp.no-hours",
        dimension: "gbp",
        severity: "warning",
        title: "No business hours listed",
        evidence: "The profile has no opening hours.",
        recommendation: "Set regular hours (and holiday hours) — \"open now\" filters exclude profiles without hours.",
        impact: 3,
        effort: 1,
      });
    }
    if (gbp.photoCount < 5) {
      findings.push({
        id: "gbp.few-photos",
        dimension: "gbp",
        severity: "warning",
        title: `Only ${gbp.photoCount} photo(s) visible on the profile`,
        evidence: "Profiles with 10+ quality photos get significantly more direction requests and clicks.",
        recommendation: "Upload 10+ real photos: storefront, team, work examples, interior.",
        impact: 3,
        effort: 2,
      });
    }
    if (gbp.reviewCount !== undefined && gbp.reviewCount < 10) {
      findings.push({
        id: "gbp.few-reviews",
        dimension: "gbp",
        severity: "warning",
        title: `Only ${gbp.reviewCount} review(s)`,
        evidence: `Rating ${gbp.rating ?? "n/a"} from ${gbp.reviewCount} reviews.`,
        recommendation: "Launch a simple review-request routine (post-job SMS/email with the direct review link).",
        impact: 4,
        effort: 2,
      });
    } else if (gbp.rating !== undefined && gbp.rating < 4.0) {
      findings.push({
        id: "gbp.low-rating",
        dimension: "gbp",
        severity: "critical",
        title: `Rating is ${gbp.rating} stars`,
        evidence: `${gbp.rating}★ from ${gbp.reviewCount} reviews — below the 4.0 threshold many searchers filter by.`,
        recommendation: "Respond to negative reviews professionally and drive a steady stream of new positive reviews.",
        impact: 5,
        effort: 4,
      });
    }
    if (gbp.businessStatus && gbp.businessStatus !== "OPERATIONAL") {
      findings.push({
        id: "gbp.not-operational",
        dimension: "gbp",
        severity: "critical",
        title: `Profile status: ${gbp.businessStatus}`,
        evidence: "Google is telling searchers this business is closed.",
        recommendation: "Correct the business status in the Google Business Profile dashboard immediately.",
        impact: 5,
        effort: 1,
      });
    }

    if (findings.filter((f) => f.severity !== "info").length === 0) {
      findings.push(pass({
        id: "gbp.ok",
        dimension: "gbp",
        title: "Business Profile looks strong",
        evidence: `${gbp.name}: ${gbp.rating ?? "n/a"}★ (${gbp.reviewCount ?? 0} reviews), website, phone, hours, and ${gbp.photoCount}+ photos all present.`,
      }));
    }

    return { status: "ok" as const, findings, raw: gbp };
  },
);
