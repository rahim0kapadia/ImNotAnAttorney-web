import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-amber-400">404</h1>
      <h2 className="mt-4 text-2xl font-bold text-white">
        Page not found
      </h2>
      <p className="mt-3 max-w-md text-zinc-400">
        This page doesn&apos;t exist — kind of like the motion your attorney
        said they&apos;d file last month.
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
