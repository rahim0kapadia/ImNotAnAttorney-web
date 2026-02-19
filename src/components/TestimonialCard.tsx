interface TestimonialCardProps {
  quote: string;
  name: string;
  detail: string;
}

export function TestimonialCard({ quote, name, detail }: TestimonialCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      <p className="text-sm leading-relaxed text-zinc-300">
        &ldquo;{quote}&rdquo;
      </p>
      <div className="mt-4">
        <p className="text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-zinc-400">{detail}</p>
      </div>
    </div>
  );
}
