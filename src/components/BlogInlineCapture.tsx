"use client";

import { useState } from "react";

const CHECKLIST_BY_CATEGORY: Record<string, { title: string; hook: string }> = {
  dui: {
    title: "DUI Evidence Checklist",
    hook: "5 things your DUI attorney should have checked by now — most haven't.",
  },
  "drug-cases": {
    title: "Drug Case Discovery Checklist",
    hook: "7 evidence problems real drug cases hide — and the questions that expose them.",
  },
  "white-collar": {
    title: "Federal Case Checklist",
    hook: "5 Brady/Giglio red flags your federal attorney might be missing.",
  },
  "general-defense": {
    title: "Defense Accountability Checklist",
    hook: "7 questions that separate informed defendants from easy clients.",
  },
};

interface BlogInlineCaptureProps {
  category?: string;
}

export function BlogInlineCapture({ category = "general-defense" }: BlogInlineCaptureProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const checklist = CHECKLIST_BY_CATEGORY[category] || CHECKLIST_BY_CATEGORY["general-defense"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: `blog-inline-${category}` }),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div role="status" className="my-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-5 text-center">
        <p className="text-sm font-semibold text-amber-400">Check your inbox.</p>
        <p className="mt-1 text-xs text-zinc-400">Your checklist is on the way.</p>
      </div>
    );
  }

  return (
    <div className="my-8 rounded-lg border border-zinc-800 bg-zinc-900/80 p-5">
      <p className="text-sm font-bold text-white">{checklist.title}</p>
      <p className="mt-1 text-xs text-zinc-400">{checklist.hook}</p>
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          aria-label="Email address"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-md bg-amber-500 px-4 py-2 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
        >
          {status === "loading" ? "..." : "Send it"}
        </button>
      </form>
      {status === "error" && (
        <p role="alert" className="mt-2 text-xs text-red-400">Something went wrong. Try again.</p>
      )}
      <p className="mt-2 text-xs text-zinc-500">Free. No spam.</p>
    </div>
  );
}
