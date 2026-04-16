/**
 * error.tsx -- Client-side error boundary for route segments.
 *
 * Catches runtime errors thrown by any page or layout BELOW the root layout.
 * When an error occurs, Next.js replaces the route segment with this component
 * instead of showing a blank page.
 *
 * Provides two recovery actions:
 *   1. "Try Again" -- calls `reset()` which re-renders the route segment.
 *   2. "Go Home" -- navigates to "/" as a full page load (uses `<a>` not `<Link>`).
 *
 * Must be a Client Component ("use client") because it receives the `reset` function
 * and handles user interaction.
 *
 * The `error` prop includes an optional `digest` property (hashed error ID) that
 * is safe to log or display. The full error message is NOT shown to users.
 */
"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-3xl">
          !
        </div>
        <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
        <p className="mt-3 max-w-md text-zinc-400">
          We hit an unexpected error. This isn&apos;t your fault, try
          refreshing, or head back to the homepage.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            Try Again
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="rounded-lg border border-zinc-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-zinc-500"
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}
