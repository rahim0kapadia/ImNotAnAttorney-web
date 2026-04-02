"use client";
/**
 * AdminNav — Shared navigation bar for /admin/* pages.
 * Highlights the current page based on pathname.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_LINKS = [
  { href: "/admin/inbox", label: "Inbox" },
  { href: "/admin/demand", label: "Demand Intel" },
  { href: "/admin/partners", label: "Partners" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-zinc-800 mb-6 pb-3 flex items-center gap-6">
      <span className="text-zinc-400 text-sm font-medium mr-2">Admin</span>
      {ADMIN_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`text-sm font-medium transition-colors ${
            pathname === link.href
              ? "text-amber-400"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
