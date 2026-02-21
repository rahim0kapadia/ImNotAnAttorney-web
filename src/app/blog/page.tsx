import { getAllPosts } from "@/lib/blog";
import { BlogCard } from "@/components/BlogCard";
import { LeadCapture } from "@/components/LeadCapture";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Criminal Defense Blog — Questions Your Attorney Should Answer",
  description:
    "In-depth legal research and defense strategies for criminal defendants. DUI, drug cases, white collar — the questions your attorney should be answering but isn't.",
  alternates: {
    canonical: "https://imnotanattorney.com/blog",
  },
};

const CATEGORIES = [
  { label: "All", value: "" },
  { label: "DUI", value: "dui" },
  { label: "Drug Cases", value: "drug-cases" },
  { label: "White Collar", value: "white-collar" },
  { label: "General Defense", value: "general-defense" },
];

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const allPosts = getAllPosts();
  const posts = category
    ? allPosts.filter(
        (p) => p.category.toLowerCase() === category.toLowerCase()
      )
    : allPosts;

  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold text-white md:text-4xl">Criminal Defense Blog — Questions Your Attorney Should Answer</h1>
        <p className="mt-3 text-zinc-400">
          Legal information that actually helps. No jargon, no fluff.
        </p>

        {/* Category filters */}
        <div className="mt-8 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <a
              key={cat.value}
              href={cat.value ? `/blog?category=${cat.value}` : "/blog"}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                (category || "") === cat.value
                  ? "bg-amber-500 text-black"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {cat.label}
            </a>
          ))}
        </div>

        {/* Posts */}
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {posts.map((post) => (
            <BlogCard
              key={post.slug}
              title={post.title}
              excerpt={post.excerpt}
              slug={post.slug}
              date={post.date}
              tags={post.tags}
              readingTime={post.readingTime}
            />
          ))}
        </div>

        {posts.length === 0 && (
          <div className="py-12 text-center text-zinc-400">
            No posts in this category yet. Check back soon.
          </div>
        )}

        {/* Lead capture */}
        <div className="mt-16">
          <LeadCapture />
        </div>
      </div>
    </div>
  );
}
