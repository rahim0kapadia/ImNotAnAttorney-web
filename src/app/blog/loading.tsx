export default function BlogLoading() {
  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="h-10 w-64 animate-pulse rounded bg-zinc-800" />
        <div className="mt-3 h-5 w-96 animate-pulse rounded bg-zinc-800/60" />
        <div className="mt-8 flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-zinc-800" />
          ))}
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-600 bg-zinc-900/50 p-6">
              <div className="h-4 w-16 animate-pulse rounded bg-zinc-800" />
              <div className="mt-3 h-6 w-full animate-pulse rounded bg-zinc-800" />
              <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-zinc-800/60" />
              <div className="mt-4 h-3 w-24 animate-pulse rounded bg-zinc-800/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
