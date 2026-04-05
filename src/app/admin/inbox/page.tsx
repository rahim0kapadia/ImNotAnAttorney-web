"use client";
/**
 * /admin/inbox — Operator email inbox viewer
 *
 * Displays inbound emails sent to help@imnotanattorney.com.
 * Auth: ADMIN_PASSWORD entered via login form, stored in sessionStorage.
 * Secret is sent via X-Admin-Password header (never in URL).
 */

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import sanitizeHtml from "sanitize-html";
import { AdminNav } from "@/components/AdminNav";

interface Email {
  id: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  message_id: string | null;
  read: boolean;
  created_at: string;
}

function InboxContent() {
  const [secret, setSecret] = useState<string>("");
  const [secretInput, setSecretInput] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [emails, setEmails] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Email | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("admin-password");
    if (stored) {
      setSecret(stored);
      setAuthenticated(true);
    }
  }, []);

  const fetchEmails = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (unreadOnly) params.set("unread", "true");
      const res = await fetch("/api/admin/emails?" + params.toString(), {
        headers: { "X-Admin-Password": secret },
      });
      if (res.status === 401) {
        setAuthenticated(false);
        setSecret("");
        sessionStorage.removeItem("admin-password");
        throw new Error("Invalid secret");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load emails");
      }
      const data = await res.json();
      setEmails(data.emails || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [secret, page, unreadOnly]);

  useEffect(() => {
    if (authenticated) fetchEmails();
  }, [authenticated, fetchEmails]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!secretInput.trim()) return;
    // Test the secret with an API call
    const res = await fetch("/api/admin/emails?page=1", {
      headers: { "X-Admin-Password": secretInput.trim() },
    });
    if (res.status === 401) {
      setError("Invalid secret");
      return;
    }
    setSecret(secretInput.trim());
    sessionStorage.setItem("admin-password", secretInput.trim());
    setAuthenticated(true);
    setError(null);
    const data = await res.json();
    setEmails(data.emails || []);
    setTotal(data.total || 0);
  }

  function handleLogout() {
    setSecret("");
    setAuthenticated(false);
    setEmails([]);
    setSelected(null);
    sessionStorage.removeItem("admin-password");
  }

  async function toggleRead(email: Email) {
    await fetch("/api/admin/emails", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Password": secret,
      },
      body: JSON.stringify({ id: email.id, read: !email.read }),
    });
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, read: !e.read } : e))
    );
    if (selected?.id === email.id)
      setSelected({ ...email, read: !email.read });
  }

  async function sendReply() {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    setSendStatus(null);
    try {
      const res = await fetch("/api/admin/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": secret,
        },
        body: JSON.stringify({
          to: selected.from_email,
          subject: selected.subject
            ? (selected.subject.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`)
            : "Re: (no subject)",
          text: replyText.trim(),
          message_id: selected.message_id,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send");
      }
      setSendStatus("Sent!");
      setReplyText("");
      setTimeout(() => {
        setReplying(false);
        setSendStatus(null);
      }, 2000);
    } catch (e) {
      setSendStatus(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  // ── LOGIN SCREEN ──
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <form onSubmit={handleLogin} className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-white mb-2 text-center">
            Admin Inbox
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
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="Password"
            aria-label="Admin inbox password"
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

  // ── INBOX ──
  const totalPages = Math.ceil(total / 25);
  const unreadCount = emails.filter((e) => !e.read).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-6xl mx-auto p-6">
        <AdminNav />
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Inbox</h1>
            <p className="text-sm text-zinc-400">
              help@imnotanattorney.com &mdash; {total} email
              {total !== 1 ? "s" : ""}
              {unreadCount > 0 && (
                <span className="ml-2 text-amber-400">
                  ({unreadCount} unread)
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={() => {
                  setUnreadOnly(!unreadOnly);
                  setPage(1);
                }}
                className="rounded border-zinc-700"
              />
              Unread only
            </label>
            <button
              onClick={fetchEmails}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-white hover:border-zinc-500 transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-900/20 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Email list */}
          <div className="space-y-1">
            {loading && emails.length === 0 ? (
              <p className="text-zinc-400 text-sm">Loading...</p>
            ) : emails.length === 0 ? (
              <p className="text-zinc-400 text-sm">No emails yet.</p>
            ) : (
              emails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => {
                    setSelected(email);
                    setReplying(false);
                    setReplyText("");
                    setSendStatus(null);
                    if (!email.read) toggleRead(email);
                  }}
                  className={`w-full text-left rounded-lg border p-4 transition-colors ${
                    selected?.id === email.id
                      ? "border-amber-500 bg-zinc-900"
                      : email.read
                        ? "border-zinc-500 bg-zinc-900/30 opacity-70"
                        : "border-zinc-700 bg-zinc-900/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {!email.read && (
                          <span className="inline-block h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
                        )}
                        <span
                          className={`text-sm truncate ${email.read ? "text-zinc-400" : "text-white font-semibold"}`}
                        >
                          {email.from_name || email.from_email}
                        </span>
                      </div>
                      <p
                        className={`text-sm truncate mt-1 ${email.read ? "text-zinc-400" : "text-zinc-300"}`}
                      >
                        {email.subject || "(no subject)"}
                      </p>
                      {email.body_text && (
                        <p className="text-xs text-zinc-400 truncate mt-1">
                          {email.body_text.slice(0, 100)}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-zinc-400 whitespace-nowrap flex-shrink-0">
                      {formatDate(email.created_at)}
                    </span>
                  </div>
                </button>
              ))
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="text-sm text-zinc-400 hover:text-white disabled:opacity-30"
                >
                  &larr; Previous
                </button>
                <span className="text-xs text-zinc-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="text-sm text-zinc-400 hover:text-white disabled:opacity-30"
                >
                  Next &rarr;
                </button>
              </div>
            )}
          </div>

          {/* Email detail */}
          <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6 min-h-[400px]">
            {selected ? (
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      {selected.subject || "(no subject)"}
                    </h2>
                    <p className="text-sm text-zinc-400 mt-1">
                      From:{" "}
                      <span className="text-zinc-300">
                        {selected.from_name
                          ? `${selected.from_name} <${selected.from_email}>`
                          : selected.from_email}
                      </span>
                    </p>
                    <p className="text-sm text-zinc-400">
                      To: {selected.to_email} &mdash;{" "}
                      {new Date(selected.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setReplying(!replying);
                        setSendStatus(null);
                      }}
                      className="text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded px-2 py-1"
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => toggleRead(selected)}
                      className="text-xs text-zinc-400 hover:text-zinc-300 border border-zinc-700 rounded px-2 py-1"
                    >
                      Mark {selected.read ? "unread" : "read"}
                    </button>
                  </div>
                </div>
                {/* Reply compose */}
                {replying && (
                  <div className="border-t border-zinc-500 pt-4 mb-4">
                    <p className="text-xs text-zinc-400 mb-2">
                      Replying to {selected.from_email}
                    </p>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your reply..."
                      rows={6}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none resize-y"
                      autoFocus
                    />
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex gap-2">
                        <button
                          onClick={sendReply}
                          disabled={sending || !replyText.trim()}
                          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 transition-colors disabled:opacity-40"
                        >
                          {sending ? "Sending..." : "Send Reply"}
                        </button>
                        <button
                          onClick={() => {
                            setReplying(false);
                            setReplyText("");
                            setSendStatus(null);
                          }}
                          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                      {sendStatus && (
                        <span
                          className={`text-sm ${sendStatus === "Sent!" ? "text-green-400" : "text-red-400"}`}
                        >
                          {sendStatus}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Email body — sanitized to prevent XSS from malicious inbound emails */}
                <div className="border-t border-zinc-500 pt-4">
                  {selected.body_html ? (
                    <div
                      className="prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(selected.body_html, {
                          allowedTags: [
                            "h1", "h2", "h3", "h4", "h5", "h6",
                            "p", "a", "div", "span",
                            "ul", "ol", "li",
                            "strong", "em", "b", "i", "u",
                            "table", "tr", "td", "th", "thead", "tbody",
                            "br", "hr",
                            "blockquote", "img",
                          ],
                          allowedAttributes: {
                            "*": ["style"],
                            a: ["href", "target", "rel"],
                            img: ["src", "alt", "width", "height"],
                          },
                          allowedSchemes: ["http", "https", "mailto"],
                          allowedStyles: {
                            "*": {
                              color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
                              "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
                              "font-size": [/^\d+(?:px|em|rem|%)$/],
                              "font-weight": [/^(?:bold|normal|\d{3})$/],
                              "text-align": [/^(?:left|center|right|justify)$/],
                              margin: [/^[-\d]+(?:px|em|rem|%)(?:\s|$)/],
                              padding: [/^[\d]+(?:px|em|rem|%)(?:\s|$)/],
                            },
                          },
                        }),
                      }}
                    />
                  ) : selected.body_text ? (
                    <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-sans">
                      {selected.body_text}
                    </pre>
                  ) : (
                    <p className="text-zinc-400 text-sm">
                      No content available.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-zinc-400 text-sm">
                  Select an email to read
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <p className="text-zinc-400">Loading...</p>
        </div>
      }
    >
      <InboxContent />
    </Suspense>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / (1000 * 60 * 60);

  if (diffH < 1) return Math.round(diffMs / (1000 * 60)) + "m ago";
  if (diffH < 24) return Math.round(diffH) + "h ago";
  if (diffH < 48) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
