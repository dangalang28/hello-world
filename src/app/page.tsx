"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ScanInput } from "@/lib/types";
import { savePendingInput } from "@/lib/storage";

export default function IntakePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    brandName: "",
    websiteUrl: "",
    city: "",
    category: "",
    gbpHint: "",
  });
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brandName.trim() || !form.websiteUrl.trim()) {
      setError("Brand name and website URL are required.");
      return;
    }
    const input: ScanInput = {
      brandName: form.brandName.trim(),
      websiteUrl: form.websiteUrl.trim(),
      city: form.city.trim() || undefined,
      category: form.category.trim() || undefined,
      gbpHint: form.gbpHint.trim() || undefined,
    };
    savePendingInput(input);
    router.push("/scan");
  }

  const field = (label: string, key: keyof typeof form, placeholder: string, hint?: string) => (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );

  return (
    <main className="mx-auto max-w-xl p-6 pt-14">
      <h1 className="text-3xl font-bold tracking-tight">Google Brand Presence Scan</h1>
      <p className="mt-2 text-slate-500">
        One-touch audit of how a brand appears across Google Search, Maps, and AI search —
        with a prioritized Top-10 action plan and ready-to-apply fixes.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl bg-white p-6 shadow">
        {field("Brand name *", "brandName", "Joe's Plumbing")}
        {field("Website URL *", "websiteUrl", "joesplumbing.com")}
        <div className="grid grid-cols-2 gap-4">
          {field("City", "city", "Austin, TX", "Improves Maps matching + local keyword analysis")}
          {field("Category", "category", "plumber", "Primary service category")}
        </div>
        {field("Google Place ID (optional)", "gbpHint", "ChIJ…", "Paste to skip listing lookup ambiguity")}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full rounded-lg bg-slate-900 py-3 text-lg font-semibold text-white hover:bg-slate-700"
        >
          Run the scan
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        <Link href="/report" className="underline hover:text-slate-600">
          Open a previous report
        </Link>
      </p>
    </main>
  );
}
