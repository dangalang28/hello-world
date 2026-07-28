"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CheckResult, Dimension, ScanResult } from "@/lib/types";
import { DIMENSION_LABELS } from "@/lib/scoring/score";
import { loadLatestScan, listSavedScans, loadScanByKey } from "@/lib/storage";
import {
  DimensionBars,
  FindingRow,
  FixKitSection,
  ManualChecklist,
  RoadmapTable,
  ScoreDial,
} from "@/components/report/sections";

const DIMENSION_ORDER: Dimension[] = ["serp", "gbp", "nap", "technical", "structured-data", "keywords", "ai"];

export default function ReportPage() {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [saved, setSaved] = useState<{ key: string; brand: string; ranAt: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setScan(loadLatestScan());
    setSaved(listSavedScans());
    setLoaded(true);
  }, []);

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as ScanResult;
        if (parsed.version === 1) setScan(parsed);
        else alert("Unsupported scan file version.");
      } catch {
        alert("Not a valid scan.json file.");
      }
    });
  }

  function download() {
    if (!scan) return;
    const blob = new Blob([JSON.stringify(scan, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `scan-${scan.input.brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!loaded) return null;

  if (!scan) {
    return (
      <main className="mx-auto max-w-xl p-6 pt-14">
        <h1 className="text-2xl font-bold">No report loaded</h1>
        <p className="mt-2 text-slate-500">
          Run a scan from the <Link href="/" className="underline">intake page</Link>, load a saved scan,
          or drop in a downloaded scan.json.
        </p>
        <input type="file" accept=".json" onChange={onUpload} className="mt-6 block text-sm" />
        {saved.length > 0 && (
          <div className="mt-8">
            <h2 className="font-semibold">Saved scans on this device</h2>
            <ul className="mt-2 space-y-1">
              {saved.map((s) => (
                <li key={s.key}>
                  <button
                    onClick={() => setScan(loadScanByKey(s.key))}
                    className="text-sm text-blue-600 underline"
                  >
                    {s.brand} — {new Date(s.ranAt).toLocaleString()}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    );
  }

  const checksByDimension = (dim: Dimension): CheckResult[] =>
    Object.values(scan.checks).filter((c): c is CheckResult => {
      if (!c) return false;
      const map: Record<string, Dimension> = {
        indexability: "technical",
        "technical-seo": "technical",
        "structured-data": "structured-data",
        pagespeed: "technical",
        gbp: "gbp",
        "nap-consistency": "nap",
        keywords: "keywords",
        serp: "serp",
        "ai-visibility": "ai",
      };
      return map[c.checkId] === dim;
    });

  const actionCount = scan.roadmap.length;
  const criticalCount = scan.roadmap.filter((r) => r.finding.severity === "critical").length;

  return (
    <main className="mx-auto max-w-4xl p-6 pb-24 print:p-0">
      {/* Toolbar */}
      <div className="no-print mb-8 flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
        <Link href="/" className="text-sm text-slate-500 hover:underline">← New scan</Link>
        <div className="flex gap-2">
          <button onClick={download} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Download scan.json
          </button>
          <button onClick={() => window.print()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
            Export PDF
          </button>
        </div>
      </div>

      {/* Cover */}
      <header className="flex flex-wrap items-center justify-between gap-8 rounded-2xl bg-white p-8 shadow-sm print:shadow-none">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Google Brand Presence Scan
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{scan.input.brandName}</h1>
          <p className="mt-1 text-slate-500">
            {scan.input.websiteUrl}
            {scan.input.city ? ` · ${scan.input.city}` : ""}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Scanned {new Date(scan.ranAt).toLocaleDateString(undefined, { dateStyle: "long" })}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <ScoreDial score={scan.scores.overall} />
          <div className="text-sm text-slate-500">
            <p className="text-lg font-semibold text-slate-800">Visibility Score</p>
            <p>{actionCount} prioritized actions</p>
            <p>{criticalCount} critical</p>
          </div>
        </div>
      </header>

      {/* Executive summary */}
      <section className="mt-8 rounded-2xl bg-white p-8 shadow-sm print:shadow-none">
        <h2 className="text-xl font-bold">Executive summary</h2>
        <p className="mt-3 leading-relaxed text-slate-600">
          {scan.narrative?.executiveSummary ??
            `This scan reviewed how ${scan.input.brandName} appears across Google Search, Maps, and AI-driven search. ` +
            `The overall visibility score is ${scan.scores.overall ?? "not fully automated"} out of 100. ` +
            `The ${actionCount} highest-impact fixes are prioritized in the roadmap below${criticalCount > 0 ? `, including ${criticalCount} critical issue${criticalCount > 1 ? "s" : ""} that should be addressed first` : ""}.`}
        </p>
        <div className="mt-6">
          <DimensionBars dimensions={scan.scores.dimensions} />
        </div>
      </section>

      {/* Roadmap */}
      <section className="print-break mt-8 rounded-2xl bg-white p-8 shadow-sm print:shadow-none">
        <h2 className="text-xl font-bold">Top-{scan.roadmap.length} Roadmap</h2>
        <p className="mt-1 text-sm text-slate-400">Ranked by impact vs. effort. Items marked “fix in kit” have ready-to-apply assets in the appendix.</p>
        <div className="mt-4">
          <RoadmapTable roadmap={scan.roadmap} />
        </div>
      </section>

      {/* Dimension sections */}
      {DIMENSION_ORDER.map((dim) => {
        const results = checksByDimension(dim);
        if (results.length === 0) return null;
        const dscore = scan.scores.dimensions.find((d) => d.dimension === dim);
        const narrative = scan.narrative?.perDimension?.[dim];
        return (
          <section key={dim} className="print-break mt-8 rounded-2xl bg-white p-8 shadow-sm print:shadow-none">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-bold">{DIMENSION_LABELS[dim]}</h2>
              <span className="text-lg font-semibold text-slate-500">
                {dscore?.score === null || dscore?.score === undefined ? "Manual review" : `${dscore.score}/100`}
              </span>
            </div>
            {narrative && <p className="mt-2 text-slate-600">{narrative}</p>}
            {results.map((r) => (
              <div key={r.checkId} className="mt-4">
                {r.findings.length > 0 && (
                  <div>
                    {r.findings.map((f, i) => (
                      <FindingRow key={`${f.id}-${i}`} finding={f} />
                    ))}
                  </div>
                )}
                {r.status === "error" && r.findings.length === 0 && !r.manualChecklist && (
                  <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                    Automated check failed{r.note ? `: ${r.note}` : ""}. Re-run the scan or review manually.
                  </p>
                )}
                <ManualChecklist result={r} />
              </div>
            ))}
          </section>
        );
      })}

      {/* Fix-It Kit */}
      {scan.fixKit.length > 0 && (
        <section className="print-break mt-8 rounded-2xl bg-white p-8 shadow-sm print:shadow-none">
          <h2 className="text-xl font-bold">Appendix: Fix-It Kit</h2>
          <p className="mt-1 text-sm text-slate-400">
            Ready-to-apply assets. Paste each where indicated, or have us apply them for you.
          </p>
          <div className="mt-6">
            <FixKitSection assets={scan.fixKit} />
          </div>
        </section>
      )}

      <footer className="mt-10 text-center text-xs text-slate-300 print:text-slate-400">
        Generated by Google Brand Presence Scan · {new Date(scan.ranAt).toLocaleDateString()}
      </footer>
    </main>
  );
}
