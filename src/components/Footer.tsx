import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-5">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="text-lg font-bold tracking-tight">
              <span className="text-amber-400">Im</span>NotAnAttorney
            </Link>
            <p className="mt-3 text-sm text-zinc-400">
              We Research. You Ask.
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Legal information, not legal advice.
            </p>
          </div>

          {/* Pages */}
          <div>
            <p className="mb-3 text-sm font-semibold text-zinc-300">Explore</p>
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
                Free Resources
              </Link>
              <Link
                href="/about"
                className="text-sm text-zinc-400 hover:text-white"
              >
                About
              </Link>
              <Link
                href="/intake"
                className="text-sm text-amber-400 hover:text-amber-300"
              >
                Get Started →
              </Link>
            </div>
          </div>

          {/* Categories */}
          <div>
            <p className="mb-3 text-sm font-semibold text-zinc-300">
              Blog Topics
            </p>
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

          {/* Services */}
          <div>
            <p className="mb-3 text-sm font-semibold text-zinc-300">
              Our Services
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href="/checkout?tier=case-decoder"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Case Decoder ($97)
              </Link>
              <Link
                href="/checkout?tier=intelligence-brief"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Intelligence Brief ($497)
              </Link>
              <Link
                href="/checkout?tier=x-ray"
                className="text-sm text-zinc-400 hover:text-white"
              >
                The X-Ray ($997)
              </Link>
              <Link
                href="/checkout?tier=war-room"
                className="text-sm text-zinc-400 hover:text-white"
              >
                The War Room ($1,997)
              </Link>
              <Link
                href="/checkout?tier=situation-room"
                className="text-sm text-zinc-400 hover:text-white"
              >
                The Situation Room ($4,997)
              </Link>
              <Link
                href="/services"
                className="text-sm text-amber-400 hover:text-amber-300"
              >
                View All Services →
              </Link>
            </div>
          </div>

          {/* Legal & Connect */}
          <div>
            <p className="mb-3 text-sm font-semibold text-zinc-300">
              Legal
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href="/terms"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Terms of Service
              </Link>
              <Link
                href="/privacy"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Privacy Policy
              </Link>
              <Link
                href="/sitemap.xml"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Sitemap
              </Link>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-400">
            <strong className="text-zinc-400">Disclaimer:</strong>{" "}
            ImNotAnAttorney provides legal information and research services,
            not legal advice. We are not a law firm and do not create an
            attorney-client relationship. Always consult with a licensed
            attorney for legal advice specific to your situation.
          </p>
        </div>

        <div className="mt-8 border-t border-zinc-800 pt-8 text-center text-xs text-zinc-400">
          © {new Date().getFullYear()} ImNotAnAttorney. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
