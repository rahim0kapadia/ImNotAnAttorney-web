/**
 * not-found.tsx -- Custom 404 page displayed when a route does not match any page.
 *
 * Also triggered explicitly by calling `notFound()` from server components
 * (e.g., when a blog post slug is not found in `src/app/blog/[slug]/page.tsx`).
 *
 * Renders a branded 404 message with on-brand humor about attorneys, plus
 * two navigation options: "Go Home" (/) and "Read the Blog" (/blog).
 *
 * This is a Server Component (no "use client") since it has no interactivity.
 */
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-amber-400">404</h1>
      <h2 className="mt-4 text-2xl font-bold text-white">
        Page not found
      </h2>
      <p className="mt-3 max-w-md text-zinc-400">
        This page doesn&apos;t exist, kind of like half the discovery
        defendants were supposed to get.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/"
          className="rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
        >
          Go Home
        </Link>
        <Link
          href="/blog"
          className="rounded-lg border border-zinc-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-zinc-500"
        >
          Read the Blog
        </Link>
      </div>
    </div>
  );
}
