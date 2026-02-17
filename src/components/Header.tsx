"use client";

import Link from "next/link";
import { useState } from "react";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight">
          <span className="text-amber-400">Im</span>NotAnAttorney
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex">
          <Link
            href="/blog"
            className="text-sm text-zinc-400 transition-colors hover:text-white"
          >
            Blog
          </Link>
          <Link
            href="/services"
            className="text-sm text-zinc-400 transition-colors hover:text-white"
          >
            Services
          </Link>
          <Link
            href="/resources"
            className="text-sm text-zinc-400 transition-colors hover:text-white"
          >
            Resources
          </Link>
          <Link
            href="/about"
            className="text-sm text-zinc-400 transition-colors hover:text-white"
          >
            About
          </Link>
          <Link
            href="#pricing"
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
          >
            Get Started
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-zinc-400 md:hidden"
          aria-label="Toggle menu"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {mobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="border-t border-zinc-800 px-4 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            <Link
              href="/blog"
              onClick={() => setMobileOpen(false)}
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              Blog
            </Link>
            <Link
              href="/services"
              onClick={() => setMobileOpen(false)}
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              Services
            </Link>
            <Link
              href="/resources"
              onClick={() => setMobileOpen(false)}
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              Resources
            </Link>
            <Link
              href="/about"
              onClick={() => setMobileOpen(false)}
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              About
            </Link>
            <Link
              href="#pricing"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black transition-colors hover:bg-amber-400"
            >
              Get Started
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
