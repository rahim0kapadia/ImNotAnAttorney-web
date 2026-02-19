import { getAllPosts, getPostBySlug, getRelatedPosts } from "@/lib/blog";
import { LeadCapture } from "@/components/LeadCapture";
import { BlogCTA } from "@/components/BlogCTA";
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
    alternates: {
      canonical: `/blog/${slug}`,
    },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      url: `/blog/${slug}`,
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
            <span className="text-sm text-zinc-400">&bull;</span>
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

        {/* Share — growth loop */}
        <div className="mt-12 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <p className="text-sm font-bold text-white">
            Know someone facing charges? Send them this.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Most defendants don&apos;t know they can hold their attorney accountable. Share this with someone who needs it.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={`sms:?body=${encodeURIComponent(`Read this — it might help with your case: https://imnotanattorney.com/blog/${slug}`)}`}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white transition-colors hover:bg-zinc-700"
            >
              📱 Text
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${post.title} https://imnotanattorney.com/blog/${slug}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white transition-colors hover:bg-zinc-700"
            >
              WhatsApp
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(`This might help — ${post.title}`)}&body=${encodeURIComponent(`I thought this might be useful for your case:\n\n${post.title}\nhttps://imnotanattorney.com/blog/${slug}\n\nIt covers questions you should be asking your attorney.`)}`}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white transition-colors hover:bg-zinc-700"
            >
              ✉️ Email
            </a>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(`https://imnotanattorney.com/blog/${slug}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white transition-colors hover:bg-zinc-700"
            >
              𝕏 Twitter
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://imnotanattorney.com/blog/${slug}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white transition-colors hover:bg-zinc-700"
            >
              Facebook
            </a>
          </div>
        </div>

        {/* Service CTA */}
        <div className="mt-12">
          <BlogCTA />
        </div>

        {/* Lead Capture */}
        <div className="mt-8">
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
