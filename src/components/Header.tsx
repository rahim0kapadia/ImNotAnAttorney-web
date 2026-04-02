/**
 * Header -- Sticky site-wide navigation bar with responsive mobile menu.
 *
 * Desktop: Horizontal nav links (Blog, Services, Resources, About) + amber "Get Started" CTA.
 * Mobile (<md breakpoint): Hamburger toggle with animated icon (bars <-> X) and
 * full-width vertical link list. Pressing Escape closes the mobile menu.
 *
 * The mobile menu auto-closes on link click via `setMobileOpen(false)`.
 *
 * Note: There is no active-route highlighting implemented yet -- all nav links
 * use identical styling regardless of the current page. Consider adding
 * `usePathname()` if active state is needed in the future.
 *
 * The header uses `sticky top-0 z-50` so it stays visible on scroll.
 */
"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";


export function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileNavRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [mobileOpen]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  // Focus trap for mobile menu
  const handleMobileKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !mobileNavRef.current) return;
    const focusable = mobileNavRef.current.querySelectorAll<HTMLElement>(
      'a[href], button, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // Landing page has no navigation — reduces CTA competition
  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Im<span className="text-amber-400">Not</span>AnAttorney
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
          {[
            { href: "/blog", label: "Blog" },
            { href: "/playbooks", label: "Playbooks" },
            { href: "/services", label: "Services" },
            { href: "/resources", label: "Resources" },
            { href: "/about", label: "About" },
            { href: "/sample", label: "Sample Report" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href || pathname?.startsWith(link.href + "/") ? "page" : undefined}
              className={`text-sm transition-colors ${
                pathname === link.href || pathname?.startsWith(link.href + "/")
                  ? "text-white font-medium"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/start"
            className="rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-black transition-all hover:bg-amber-400 hover:shadow-md hover:shadow-amber-500/30"
          >
            Get Started
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          ref={toggleRef}
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-zinc-400 md:hidden"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          <svg
            className="h-6 w-6"
            aria-hidden="true"
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
      <AnimatePresence>
      {mobileOpen && (
        <motion.nav
          ref={mobileNavRef}
          aria-label="Mobile navigation"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring" as const, stiffness: 300, damping: 30 }}
          className="overflow-hidden border-t border-zinc-800 md:hidden"
          onKeyDown={handleMobileKeyDown}
        >
          <div className="flex flex-col gap-4 px-4 py-4">
            {[
              { href: "/blog", label: "Blog" },
              { href: "/playbooks", label: "Playbooks" },
              { href: "/services", label: "Services" },
              { href: "/resources", label: "Resources" },
              { href: "/about", label: "About" },
              { href: "/sample", label: "Sample Report" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                aria-current={pathname === link.href || pathname?.startsWith(link.href + "/") ? "page" : undefined}
                className={`text-sm transition-colors ${
                  pathname === link.href || pathname?.startsWith(link.href + "/")
                    ? "text-white font-medium"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/start"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg bg-amber-500 px-4 py-3 text-center text-sm font-semibold text-black transition-colors hover:bg-amber-400"
            >
              Get Started
            </Link>
          </div>
        </motion.nav>
      )}
      </AnimatePresence>
    </header>
  );
}
