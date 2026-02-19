import Link from "next/link";

interface BlogCardProps {
  title: string;
  excerpt: string;
  slug: string;
  date: string;
  tags: string[];
  readingTime: string;
}

export function BlogCard({
  title,
  excerpt,
  slug,
  date,
  tags,
  readingTime,
}: BlogCardProps) {
  return (
    <article className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 transition-colors hover:border-zinc-700">
      <div className="mb-3 flex items-center gap-3">
        <time className="text-xs text-zinc-400">{date}</time>
        <span className="text-xs text-zinc-400">&bull;</span>
        <span className="text-xs text-zinc-400">{readingTime}</span>
      </div>
      <Link href={`/blog/${slug}`}>
        <h2 className="text-lg font-bold text-white transition-colors group-hover:text-amber-400">
          {title}
        </h2>
      </Link>
      <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{excerpt}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-400"
          >
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}
