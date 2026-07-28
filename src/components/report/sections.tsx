"use client";

import type { CheckResult, DimensionScore, Finding, FixAsset, RoadmapItem, Severity } from "@/lib/types";
import { DIMENSION_LABELS } from "@/lib/scoring/score";

const SEVERITY_STYLE: Record<Severity, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-red-100 text-red-700" },
  warning: { label: "Warning", cls: "bg-amber-100 text-amber-700" },
  opportunity: { label: "Opportunity", cls: "bg-blue-100 text-blue-700" },
  pass: { label: "Pass", cls: "bg-green-100 text-green-700" },
  info: { label: "Info", cls: "bg-slate-100 text-slate-600" },
};

export function ScoreDial({ score }: { score: number | null }) {
  const value = score ?? 0;
  const color = score === null ? "#94a3b8" : score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  const angle = (value / 100) * 360;
  return (
    <div className="relative h-36 w-36 print-avoid-break">
      <div
        className="h-36 w-36 rounded-full"
        style={{ background: `conic-gradient(${color} ${angle}deg, #e2e8f0 ${angle}deg)` }}
      />
      <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white">
        <span className="text-4xl font-bold" style={{ color }}>
          {score ?? "—"}
        </span>
        <span className="text-xs text-slate-400">/ 100</span>
      </div>
    </div>
  );
}

export function DimensionBars({ dimensions }: { dimensions: DimensionScore[] }) {
  return (
    <div className="space-y-3">
      {dimensions.map((d) => (
        <div key={d.dimension} className="flex items-center gap-3">
          <span className="w-52 shrink-0 text-sm font-medium text-slate-600">
            {DIMENSION_LABELS[d.dimension]}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            {d.score !== null && (
              <div
                className={`h-full rounded-full ${d.score >= 80 ? "bg-green-500" : d.score >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${d.score}%` }}
              />
            )}
          </div>
          <span className="w-24 shrink-0 text-right text-sm font-semibold">
            {d.score === null ? <span className="text-slate-400">manual ↓</span> : `${d.score}/100`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function FindingRow({ finding }: { finding: Finding }) {
  const s = SEVERITY_STYLE[finding.severity];
  return (
    <div className="print-avoid-break border-b border-slate-100 py-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="font-medium">{finding.title}</div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">{finding.evidence}</p>
      {finding.severity !== "pass" && finding.severity !== "info" && (
        <p className="mt-1 text-sm text-slate-700">
          <span className="font-semibold">Fix:</span> {finding.recommendation}
          {finding.fixAssetRef && (
            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
              fix included in kit ↓
            </span>
          )}
        </p>
      )}
    </div>
  );
}

export function ManualChecklist({ result }: { result: CheckResult }) {
  if (!result.manualChecklist?.length) return null;
  return (
    <div className="print-avoid-break mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="mb-2 text-sm font-semibold text-amber-800">
        Manual review checklist{result.note ? ` — ${result.note}` : ""}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-amber-700">
            <th className="pb-1 pr-3">Step</th>
            <th className="pb-1 pr-3">What to look for</th>
            <th className="pb-1 w-28">Observed</th>
          </tr>
        </thead>
        <tbody>
          {result.manualChecklist.map((step, i) => (
            <tr key={i} className="border-t border-amber-200 align-top">
              <td className="py-2 pr-3">{step.step}</td>
              <td className="py-2 pr-3 text-amber-900">{step.lookFor}</td>
              <td className="py-2 border-b border-dashed border-amber-400" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RoadmapTable({ roadmap }: { roadmap: RoadmapItem[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b-2 border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
          <th className="py-2 pr-2">#</th>
          <th className="py-2 pr-3">Action</th>
          <th className="py-2 pr-3">Why it matters</th>
          <th className="py-2 pr-2">Impact</th>
          <th className="py-2 pr-2">Effort</th>
          <th className="py-2">Fix in kit</th>
        </tr>
      </thead>
      <tbody>
        {roadmap.map((item) => (
          <tr key={item.rank} className="print-avoid-break border-b border-slate-100 align-top">
            <td className="py-3 pr-2 text-lg font-bold text-slate-300">{item.rank}</td>
            <td className="py-3 pr-3">
              <div className="font-semibold">{item.finding.recommendation}</div>
              <div className="mt-0.5 text-xs text-slate-400">
                {item.finding.title}
                {item.alsoOn ? ` (also on ${item.alsoOn} more page${item.alsoOn > 1 ? "s" : ""})` : ""}
              </div>
            </td>
            <td className="py-3 pr-3 text-slate-500">{item.finding.evidence}</td>
            <td className="py-3 pr-2 font-semibold">{item.finding.impact}/5</td>
            <td className="py-3 pr-2">{item.finding.effort}/5</td>
            <td className="py-3">
              {item.finding.fixAssetRef ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">yes ↓</span>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FixKitSection({ assets }: { assets: FixAsset[] }) {
  return (
    <div className="space-y-6">
      {assets.map((asset) => (
        <div key={asset.id} className="print-avoid-break">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{asset.title}</h3>
            <button
              onClick={() => navigator.clipboard.writeText(asset.content)}
              className="no-print rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
            >
              Copy
            </button>
          </div>
          {asset.appliesTo && <p className="text-xs text-slate-400">Applies to: {asset.appliesTo}</p>}
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100 whitespace-pre-wrap">
            {asset.content}
          </pre>
        </div>
      ))}
    </div>
  );
}
