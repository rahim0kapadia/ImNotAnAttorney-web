import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <Link href="/" className="text-lg font-bold tracking-tight">
              <span className="text-amber-400">Im</span>NotAnAttorney
            </Link>
            <p className="mt-3 text-sm text-zinc-400">
              We Research. You Ask.
            </p>
            <p className="mt-2 text-xs text-zinc-600">
              We provide legal information, not legal advice.
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-zinc-300">Pages</h4>
            <div className="flex flex-col gap-2">
              <Link
                href="/blog"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Blog
              </Link>
              <Link
                href="/services"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Services
              </Link>
              <Link
                href="/resources"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Resources
              </Link>
              <Link
                href="/about"
                className="text-sm text-zinc-400 hover:text-white"
              >
                About
              </Link>
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-zinc-300">
              Categories
            </h4>
            <div className="flex flex-col gap-2">
              <Link
                href="/blog?category=dui"
                className="text-sm text-zinc-400 hover:text-white"
              >
                DUI Defense
              </Link>
              <Link
                href="/blog?category=drug-cases"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Drug Cases
              </Link>
              <Link
                href="/blog?category=white-collar"
                className="text-sm text-zinc-400 hover:text-white"
              >
                White Collar
              </Link>
              <Link
                href="/blog?category=general-defense"
                className="text-sm text-zinc-400 hover:text-white"
              >
                General Defense
              </Link>
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-zinc-300">Legal</h4>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-zinc-600">
                ImNotAnAttorney is not a law firm and does not provide legal
                advice. All content is for informational purposes only.
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-zinc-800 pt-8 text-center text-xs text-zinc-600">
          &copy; {new Date().getFullYear()} ImNotAnAttorney. All rights
          reserved.
        </div>
      </div>
    </footer>
  );
}
