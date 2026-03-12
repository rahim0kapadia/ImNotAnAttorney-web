export default function CheckoutLoading() {
  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="h-10 w-48 animate-pulse rounded bg-zinc-800" />
        <div className="mt-3 h-5 w-72 animate-pulse rounded bg-zinc-800/60" />
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-8">
          <div className="h-8 w-40 animate-pulse rounded bg-zinc-800" />
          <div className="mt-6 space-y-4">
            <div className="h-12 w-full animate-pulse rounded bg-zinc-800" />
            <div className="h-12 w-full animate-pulse rounded bg-zinc-800" />
            <div className="h-5 w-64 animate-pulse rounded bg-zinc-800/60" />
            <div className="mt-4 h-12 w-full animate-pulse rounded bg-amber-500/20" />
          </div>
        </div>
      </div>
    </div>
  );
}
