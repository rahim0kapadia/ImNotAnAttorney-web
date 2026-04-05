"use client";
/**
 * OperatorShell — shared wrapper for all /operator/* pages.
 *
 * Handles:
 *   1. Login form (stores admin-password in sessionStorage)
 *   2. Sidebar navigation (cases, jobs, metrics)
 *   3. Content area (renders children)
 *   4. Logout
 *
 * Auth approach: matches existing admin pages — sessionStorage + X-Admin-Password header.
 * The key name "admin-password" matches the demand page pattern.
 */

import { useState, useEffect, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/operator", label: "Dashboard", icon: "H" },
  { href: "/operator/cases", label: "Cases", icon: "C" },
  { href: "/operator/jobs", label: "Jobs", icon: "J" },
  { href: "/operator/metrics", label: "Metrics", icon: "M" },
] as const;

export function OperatorShell({ children }: { children: ReactNode }) {
  const [password, setPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const pathname = usePathname();

  // Restore session on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("admin-password");
    if (stored) {
      setPassword(stored);
      setAuthenticated(true);
    }
    setChecking(false);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    setError(null);

    // Verify password against an operator API endpoint
    const res = await fetch("/api/operator/metrics", {
      headers: { "X-Admin-Password": passwordInput.trim() },
    });
    if (res.status === 401) {
      setError("Invalid password");
      return;
    }
    if (!res.ok) {
      setError("Server error — try again");
      return;
    }

    setPassword(passwordInput.trim());
    sessionStorage.setItem("admin-password", passwordInput.trim());
    setAuthenticated(true);
  }

  function handleLogout() {
    setPassword("");
    setAuthenticated(false);
    sessionStorage.removeItem("admin-password");
  }

  // Loading state
  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-400 text-sm">Loading...</p>
      </div>
    );
  }

  // Login screen
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <form onSubmit={handleLogin} className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-white mb-2 text-center">
            Operator Dashboard
          </h1>
          <p className="text-zinc-400 text-sm text-center mb-6">
            Enter password to continue
          </p>
          {error && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            autoFocus
          />
          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-amber-500 py-3 text-sm font-semibold text-black hover:bg-amber-400 transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    );
  }

  // Authenticated shell
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-zinc-500 bg-zinc-950 flex flex-col">
        <div className="p-4 border-b border-zinc-500">
          <h2 className="text-sm font-bold text-white tracking-wide">
            INNA Operator
          </h2>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/operator"
                ? pathname === "/operator"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                }`}
              >
                <span className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center text-xs font-mono text-zinc-400">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-zinc-500">
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <PasswordContext.Provider value={password}>
          {children}
        </PasswordContext.Provider>
      </main>
    </div>
  );
}

// ============================================================
// Auth context — children use this to get the password for API calls
// ============================================================
import { createContext, useContext } from "react";

const PasswordContext = createContext<string>("");

/** Hook for child pages to get the admin password for API calls. */
export function useOperatorPassword(): string {
  return useContext(PasswordContext);
}

/** Helper: build headers with admin password for operator API calls. */
export function operatorHeaders(password: string): HeadersInit {
  return {
    "X-Admin-Password": password,
    "Content-Type": "application/json",
  };
}
