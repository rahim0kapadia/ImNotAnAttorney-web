import { getAllPosts, getPostBySlug, getRelatedPosts } from "@/lib/blog";
import { LeadCapture } from "@/components/LeadCapture";
import { BlogCard } from "@/components/BlogCard";
import { MDXRemote } from "next-mdx-remote/rsc";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      publishedTime: post.date,
      tags: post.tags,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) notFound();

  const related = getRelatedPosts(slug);

  return (
    <article className="px-4 py-16">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <time className="text-sm text-zinc-500">{post.date}</time>
            <span className="text-sm text-zinc-600">&bull;</span>
            <span className="text-sm text-zinc-500">{post.readingTime}</span>
          </div>
          <h1 className="text-3xl font-bold leading-tight text-white md:text-4xl">
            {post.title}
          </h1>
          <p className="mt-4 text-lg text-zinc-400">{post.excerpt}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Article schema markup */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Article",
              headline: post.title,
              description: post.excerpt,
              datePublished: post.date,
              author: {
                "@type": "Organization",
                name: "ImNotAnAttorney",
              },
            }),
          }}
        />

        {/* Content */}
        <div className="prose prose-invert prose-amber max-w-none prose-headings:text-white prose-p:text-zinc-300 prose-a:text-amber-400 prose-strong:text-white prose-li:text-zinc-300">
          <MDXRemote source={post.content} />
        </div>

        {/* Share */}
        <div className="mt-12 border-t border-zinc-800 pt-8">
          <p className="text-sm font-semibold text-zinc-400">
            Share this article
          </p>
          <div className="mt-3 flex gap-4">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(`https://imnotanattorney.com/blog/${slug}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-500 transition-colors hover:text-white"
            >
              Twitter / X
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://imnotanattorney.com/blog/${slug}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-500 transition-colors hover:text-white"
            >
              Facebook
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(`Check this out: https://imnotanattorney.com/blog/${slug}`)}`}
              className="text-sm text-zinc-500 transition-colors hover:text-white"
            >
              Email
            </a>
          </div>
        </div>

        {/* Lead Capture */}
        <div className="mt-12">
          <LeadCapture />
        </div>

        {/* Related Posts */}
        {related.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-6 text-xl font-bold text-white">
              Related Articles
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              {related.map((rp) => (
                <BlogCard
                  key={rp.slug}
                  title={rp.title}
                  excerpt={rp.excerpt}
                  slug={rp.slug}
                  date={rp.date}
                  tags={rp.tags}
                  readingTime={rp.readingTime}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
