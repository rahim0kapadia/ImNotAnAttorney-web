import Link from "next/link";

export function BlogCTA() {
  return (
    <div className="rounded-xl border border-amber-500/50 bg-zinc-900 p-6">
      <h3 className="text-lg font-bold text-white">
        The defendants who walk in prepared{" "}
        <span className="text-amber-400">don&apos;t use general information.</span>
      </h3>
      <p className="mt-2 text-sm text-zinc-400">
        They use case-specific research — questions built from their
        actual charges, their actual discovery, their actual judge. Our
        Case Decoder gives you 10-15 targeted questions your attorney
        isn&apos;t expecting. Starting at $97.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/checkout?tier=case-decoder"
          className="rounded-lg bg-amber-500 px-6 py-3 text-center text-sm font-semibold text-black transition-colors hover:bg-amber-400"
        >
          Get Your Case Decoder — $97 →
        </Link>
        <Link
          href="/sample"
          className="rounded-lg border border-zinc-700 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:border-zinc-500"
        >
          See a Sample Report
        </Link>
      </div>
    </div>
  );
}
