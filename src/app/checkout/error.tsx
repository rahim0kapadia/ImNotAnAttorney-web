"use client";

import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-3xl text-red-400">
          &#10007;
        </div>
        <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
        <p className="mt-4 text-zinc-400">
          We hit an unexpected error loading this page. Your payment was not affected.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-zinc-500">Error: {error.digest}</p>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
          >
            Try Again
          </button>
          <Link
            href="/services"
            className="rounded-lg border border-zinc-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-zinc-500"
          >
            View Services
          </Link>
        </div>
        <p className="mt-6 text-sm text-zinc-400">
          Need help? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-amber-400 underline">
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
