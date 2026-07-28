export type CheckId =
  | "indexability"
  | "technical-seo"
  | "structured-data"
  | "pagespeed"
  | "gbp"
  | "nap-consistency"
  | "keywords"
  | "serp"
  | "ai-visibility";

export type Dimension =
  | "serp"
  | "gbp"
  | "nap"
  | "keywords"
  | "technical"
  | "structured-data"
  | "ai";

export interface ScanInput {
  brandName: string;
  websiteUrl: string;
  city?: string;
  category?: string;
  gbpHint?: string; // Place ID or exact listing name
  competitors?: string[];
}

export type Severity = "critical" | "warning" | "opportunity" | "pass" | "info";

export interface Finding {
  id: string; // stable family id, e.g. "tech.missing-canonical"
  dimension: Dimension;
  severity: Severity;
  title: string;
  evidence: string;
  evidenceUrl?: string;
  recommendation: string;
  impact: 1 | 2 | 3 | 4 | 5;
  effort: 1 | 2 | 3 | 4 | 5; // 1 = trivial fix
  fixAssetRef?: string;
}

export type CheckStatus = "ok" | "partial" | "manual" | "error";

export interface ManualStep {
  step: string;
  lookFor: string;
}

export interface CheckResult {
  checkId: CheckId;
  status: CheckStatus;
  findings: Finding[];
  raw?: unknown; // provider payload slice kept for fix generation
  manualChecklist?: ManualStep[];
  note?: string; // short status note ("GOOGLE_API_KEY not configured")
  durationMs: number;
}

export interface DimensionScore {
  dimension: Dimension;
  score: number | null; // null = not automatically scoreable
  label: "strong" | "fair" | "weak" | "manual";
  findingCount: Record<Severity, number>;
}

export interface RoadmapItem {
  rank: number;
  finding: Finding;
  priorityScore: number;
  alsoOn?: number; // duplicate instances rolled up
}

export type FixAssetKind =
  | "jsonld"
  | "nap-block"
  | "gbp-description"
  | "meta-rewrites"
  | "robots"
  | "sitemap-note";

export interface FixAsset {
  id: string;
  kind: FixAssetKind;
  title: string;
  content: string; // paste-ready
  format: "json" | "html" | "text";
  appliesTo?: string; // URL or "Google Business Profile"
  generatedBy: "deterministic" | "llm";
}

export interface ScanNarrative {
  executiveSummary: string;
  perDimension: Partial<Record<Dimension, string>>;
}

export interface ScanResult {
  version: 1;
  input: ScanInput;
  ranAt: string;
  checks: Partial<Record<CheckId, CheckResult>>;
  scores: { overall: number | null; dimensions: DimensionScore[] };
  roadmap: RoadmapItem[];
  fixKit: FixAsset[];
  narrative?: ScanNarrative;
}

// ---------- Crawl ----------

export interface PageExtract {
  url: string; // final URL after redirects
  requestedUrl: string;
  status: number;
  title: string | null;
  metaDescription: string | null;
  metaRobots: string | null;
  canonical: string | null;
  h1s: string[];
  ogTags: Record<string, string>;
  jsonLd: unknown[]; // parsed JSON-LD blocks
  jsonLdErrors: number; // blocks that failed to parse
  napCandidates: NapCandidate[];
  socialLinks: string[];
  internalLinks: string[]; // absolute, same-host
  textSample: string; // first ~2000 chars of visible text
  https: boolean;
}

export interface NapCandidate {
  source: string; // "footer" | "contact-page" | "jsonld" | "body"
  pageUrl: string;
  name?: string;
  phone?: string; // as found
  phoneNormalized?: string; // digits only
  address?: string;
}

export interface CrawlBundle {
  startUrl: string;
  finalOrigin: string;
  pages: PageExtract[];
  robotsTxt: { found: boolean; content: string | null; url: string };
  sitemap: { found: boolean; url: string | null; urlCount: number };
  errors: string[];
}

// ---------- Check plumbing ----------

export interface CheckInput {
  scan: ScanInput;
  crawl?: CrawlBundle;
  priorResults?: Partial<Record<CheckId, CheckResult>>;
}

export interface CheckMeta {
  id: CheckId;
  name: string;
  dimension: Dimension;
  requires: ("crawl" | "gbp")[];
}

export interface Check extends CheckMeta {
  run(input: CheckInput): Promise<CheckResult>;
}

// ---------- SERP provider ----------

export interface SerpResult {
  position: number;
  url: string;
  title: string;
  domain: string;
}

export type SerpResponse =
  | { available: true; query: string; results: SerpResult[]; knowledgePanel?: boolean }
  | { available: false; reason: string };

export interface SerpProvider {
  name: string;
  search(query: string): Promise<SerpResponse>;
}

// ---------- GBP raw slice ----------

export interface GbpData {
  placeId: string;
  name: string;
  formattedAddress?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  categories: string[];
  hasHours: boolean;
  photoCount: number;
  businessStatus?: string;
  mapsUrl?: string;
}
