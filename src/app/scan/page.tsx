"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CheckId } from "@/lib/types";
import { CHECK_NAMES } from "@/lib/check-names";
import { ALL_CHECKS, runScan, type ScanProgress } from "@/lib/orchestrator";
import { loadPendingInput, saveScanResult } from "@/lib/storage";

const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "queued", cls: "bg-slate-100 text-slate-500" },
  running: { label: "running…", cls: "bg-blue-100 text-blue-700 animate-pulse" },
  done: { label: "done", cls: "bg-green-100 text-green-700" },
  failed: { label: "failed", cls: "bg-red-100 text-red-700" },
};

export default function ScanPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [brand, setBrand] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const input = loadPendingInput();
    if (!input) {
      router.replace("/");
      return;
    }
    setBrand(input.brandName);
    runScan(input, setProgress).then((result) => {
      saveScanResult(result);
      router.push("/report");
    });
  }, [router]);

  return (
    <main className="mx-auto max-w-xl p-6 pt-14">
      <h1 className="text-2xl font-bold">Scanning {brand}…</h1>
      <p className="mt-1 text-slate-500">
        {progress?.phase === "fixkit"
          ? "Checks complete — generating the Fix-It Kit and report narrative…"
          : "Running visibility checks in parallel. This takes 1–2 minutes (PageSpeed is the slow one)."}
      </p>

      <div className="mt-8 space-y-2">
        <Row name="Site crawl" state={progress?.crawl ?? "running"} note={progress?.crawl === "failed" ? "Site unreachable — dependent checks will report accordingly" : undefined} />
        {ALL_CHECKS.map((id: CheckId) => {
          const c = progress?.checks[id];
          const status = c?.result?.status;
          const note =
            c?.result?.note ??
            (status === "manual" ? "Needs manual review — checklist included in report" : undefined);
          return <Row key={id} name={CHECK_NAMES[id]} state={c?.state ?? "pending"} note={note} manual={status === "manual"} />;
        })}
      </div>

      {progress?.phase === "fixkit" && (
        <div className="mt-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-700">Building fix assets…</div>
      )}
    </main>
  );
}

function Row({ name, state, note, manual }: { name: string; state: string; note?: string; manual?: boolean }) {
  const badge = manual && state === "done" ? { label: "manual", cls: "bg-amber-100 text-amber-700" } : STATE_BADGE[state];
  return (
    <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
      <div>
        <div className="font-medium">{name}</div>
        {note && <div className="mt-0.5 max-w-md truncate text-xs text-slate-400">{note}</div>}
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
    </div>
  );
}
