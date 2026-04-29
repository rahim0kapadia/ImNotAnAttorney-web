"use client";
/**
 * /admin/inbox, Operator email inbox viewer.
 *
 * Layout adapted from shadcn/ui Mail example (https://ui.shadcn.com/examples/mail)
 * built with project's existing pure-Tailwind approach (no shadcn deps added).
 * Keystroke layer inspired by Superhuman.
 *
 * Auth: ADMIN_PASSWORD entered via login form, stored in sessionStorage.
 * Secret is sent via X-Admin-Password header (never in URL).
 */

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  Suspense,
} from "react";
import sanitizeHtml from "sanitize-html";
import {
  Search,
  Inbox as InboxIcon,
  Reply,
  ReplyAll,
  Forward,
  CornerUpLeft,
  RefreshCw,
  LogOut,
  Mail,
  MailOpen,
  ChevronLeft,
  ChevronRight,
  Command,
  X,
  Keyboard,
  Trash2,
  Star,
  Clock,
  Tag,
  Plus,
  PencilLine,
} from "lucide-react";
import { AdminNav } from "@/components/AdminNav";

interface Email {
  id: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  headers: Record<string, unknown> | null;
  message_id: string | null;
  read: boolean;
  starred: boolean;
  snoozed_until: string | null;
  labels: string[];
  created_at: string;
}

interface SenderEntry {
  email: string;
  name: string | null;
}

type View = "all" | "unread" | "starred" | "snoozed";

/** Extract cc recipients from inbound webhook headers payload. */
function extractCc(headers: Record<string, unknown> | null | undefined): string[] {
  if (!headers || typeof headers !== "object") return [];
  const cc = (headers as Record<string, unknown>).cc;
  if (Array.isArray(cc)) {
    return cc
      .map((v) => (typeof v === "string" ? v : ""))
      .filter(Boolean)
      .map(emailFromHeader)
      .filter(Boolean);
  }
  if (typeof cc === "string") {
    return cc.split(",").map(emailFromHeader).filter(Boolean);
  }
  return [];
}

/** Parse `Name <addr@x.com>` or `addr@x.com` into bare email. */
function emailFromHeader(s: string): string {
  const m = s.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (m) return m[1].toLowerCase();
  const trim = s.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trim) ? trim : "";
}

/**
 * Email-HTML sanitizer policy.
 *
 * Strips dangerous tags/attributes (scripts, event handlers, javascript: URLs)
 * but keeps the email's inline styles intact — layout-critical properties
 * (width/height/display/vertical-align/etc.) are needed for table-based email
 * HTML to render correctly. CSS is not a security risk inside a sandboxed
 * iframe without `allow-scripts`. Pattern matches Close.com's recommendation
 * (https://making.close.com/posts/rendering-untrusted-html-email-safely/).
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "a", "div", "span", "section", "article", "header", "footer", "main", "nav", "aside",
    "ul", "ol", "li",
    "strong", "em", "b", "i", "u", "s", "small", "sub", "sup", "code", "pre",
    "table", "tr", "td", "th", "thead", "tbody", "tfoot", "caption", "colgroup", "col",
    "br", "hr",
    "blockquote", "img", "figure", "figcaption",
    "center", "font",
  ],
  allowedAttributes: {
    "*": ["style", "class", "id", "align", "valign", "bgcolor", "color", "dir", "lang", "title"],
    a: ["href", "target", "rel", "name"],
    img: ["src", "alt", "width", "height", "border", "hspace", "vspace", "longdesc"],
    table: ["width", "height", "cellpadding", "cellspacing", "border", "summary"],
    td: ["width", "height", "colspan", "rowspan", "headers", "scope"],
    th: ["width", "height", "colspan", "rowspan", "headers", "scope", "abbr"],
    tr: ["height"],
    col: ["width", "span"],
    colgroup: ["width", "span"],
    font: ["size", "face"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  // Deliberately NO allowedStyles — full inline CSS pass-through. Iframe
  // sandbox blocks JS; CSS cannot escape. Stripping styles destroys layout.
  // sanitize-html still strips javascript: / vbscript: / data: URLs in href/src
  // by default, which is the actual security boundary we need.
  allowedSchemesByTag: {
    img: ["http", "https", "data", "cid"],
  },
  // Extra defense: forbid event-handler attributes anywhere
  disallowedTagsMode: "discard",
};

function InboxContent() {
  const [secret, setSecret] = useState<string>("");
  const [secretInput, setSecretInput] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [emails, setEmails] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [composeMode, setComposeMode] = useState<"reply" | "forward" | null>(null);
  const [replyText, setReplyText] = useState("");
  const [forwardTo, setForwardTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [senders, setSenders] = useState<SenderEntry[]>([]);
  const [fromAddr, setFromAddr] = useState<string>("");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

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
      params.set("view", view);
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
  }, [secret, page, view]);

  useEffect(() => {
    if (authenticated) fetchEmails();
  }, [authenticated, fetchEmails]);

  // Load FROM allowlist once authenticated
  useEffect(() => {
    if (!authenticated || !secret) return;
    fetch("/api/admin/reply", { headers: { "X-Admin-Password": secret } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.senders) setSenders(d.senders);
      })
      .catch(() => {});
  }, [authenticated, secret]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!secretInput.trim()) return;
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
    setSelectedId(null);
    sessionStorage.removeItem("admin-password");
  }

  type EmailPatch = {
    read?: boolean;
    starred?: boolean;
    snoozed_until?: string | null;
    labels?: string[];
  };
  const patchEmail = useCallback(
    async (id: string, patch: EmailPatch) => {
      // Optimistic local update
      setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      const res = await fetch("/api/admin/emails", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": secret,
        },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        // Revert on failure (best-effort: refetch)
        fetchEmails();
      }
    },
    [secret, fetchEmails]
  );

  const toggleRead = useCallback(
    (email: Email) => patchEmail(email.id, { read: !email.read }),
    [patchEmail]
  );
  const toggleStar = useCallback(
    (email: Email) => patchEmail(email.id, { starred: !email.starred }),
    [patchEmail]
  );
  function snoozeUntil(email: Email, iso: string | null) {
    return patchEmail(email.id, { snoozed_until: iso });
  }
  function setLabels(email: Email, labels: string[]) {
    return patchEmail(email.id, { labels });
  }

  // Filter + select-resolve
  const filtered = useMemo(() => {
    if (!search.trim()) return emails;
    const q = search.toLowerCase();
    return emails.filter((e) => {
      return (
        (e.from_name || "").toLowerCase().includes(q) ||
        e.from_email.toLowerCase().includes(q) ||
        (e.subject || "").toLowerCase().includes(q) ||
        (e.body_text || "").toLowerCase().includes(q)
      );
    });
  }, [emails, search]);

  const selected = useMemo(
    () => filtered.find((e) => e.id === selectedId) || null,
    [filtered, selectedId]
  );

  const unreadCount = useMemo(
    () => emails.filter((e) => !e.read).length,
    [emails]
  );

  // Auto-mark read on selection
  useEffect(() => {
    if (selected && !selected.read) {
      toggleRead(selected);
    }
  }, [selected, toggleRead]);

  // Default FROM = the address the inbound was sent TO (Front shared-inbox
  // convention). Falls back to first allowlisted sender.
  useEffect(() => {
    if (!senders.length) return;
    if (!selected) {
      if (!fromAddr) setFromAddr(senders[0].email);
      return;
    }
    const orig = (selected.to_email || "").toLowerCase();
    const match = senders.find((s) => s.email === orig);
    setFromAddr(match ? match.email : senders[0].email);
  }, [selected, senders, fromAddr]);

  async function sendCompose() {
    if (!selected || !composeMode || !replyText.trim()) return;
    const recipient =
      composeMode === "forward" ? forwardTo.trim() : selected.from_email;
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      setSendStatus("Recipient email looks invalid");
      return;
    }
    const ccList = composeCc
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    const subjectPrefix = composeMode === "forward" ? "Fwd: " : "Re: ";
    const subjectBase = selected.subject || "(no subject)";
    const subject = subjectBase.startsWith(subjectPrefix.trim())
      ? subjectBase
      : subjectPrefix + subjectBase;

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
          to: recipient,
          cc: ccList,
          from: fromAddr || undefined,
          mode: composeMode,
          subject,
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
      setForwardTo("");
      setComposeCc("");
      setTimeout(() => {
        setComposeMode(null);
        setSendStatus(null);
      }, 1500);
    } catch (e) {
      setSendStatus(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  function buildForwardBody(e: Email): string {
    const stripHtml = (html: string) =>
      html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    const original =
      e.body_text || (e.body_html ? stripHtml(e.body_html) : "(empty body)");
    return [
      "",
      "",
      "---------- Forwarded message ----------",
      `From: ${e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email}`,
      `Date: ${new Date(e.created_at).toLocaleString()}`,
      `Subject: ${e.subject || "(no subject)"}`,
      `To: ${e.to_email}`,
      "",
      original,
    ].join("\n");
  }

  function openCompose(mode: "reply" | "forward", opts?: { replyAll?: boolean }) {
    if (!selected) return;
    setComposeMode(mode);
    setSendStatus(null);
    if (mode === "forward") {
      setForwardTo("");
      setComposeCc("");
      setReplyText(buildForwardBody(selected));
    } else {
      setReplyText("");
      if (opts?.replyAll) {
        const ccCandidates = extractCc(selected.headers);
        const senderEmails = new Set(senders.map((s) => s.email));
        const filtered = Array.from(
          new Set(
            ccCandidates.filter((e) => e !== selected.from_email && !senderEmails.has(e))
          )
        );
        setComposeCc(filtered.join(", "));
      } else {
        setComposeCc("");
      }
    }
    setTimeout(() => replyTextareaRef.current?.focus(), 0);
  }

  function ccCount(email: Email | null): number {
    if (!email) return 0;
    const ccs = extractCc(email.headers);
    const senderSet = new Set(senders.map((s) => s.email));
    return ccs.filter((e) => e !== email.from_email && !senderSet.has(e)).length;
  }

  function snoozePreset(email: Email, preset: "1h" | "tomorrow" | "weekend" | "next-week" | "clear") {
    if (preset === "clear") return snoozeUntil(email, null);
    const now = new Date();
    let target: Date;
    if (preset === "1h") {
      target = new Date(now.getTime() + 60 * 60 * 1000);
    } else if (preset === "tomorrow") {
      target = new Date(now);
      target.setDate(target.getDate() + 1);
      target.setHours(9, 0, 0, 0);
    } else if (preset === "weekend") {
      target = new Date(now);
      const day = target.getDay();
      const offset = day <= 6 ? 6 - day : 0; // Saturday
      target.setDate(target.getDate() + (offset || 7));
      target.setHours(9, 0, 0, 0);
    } else {
      target = new Date(now);
      const day = target.getDay();
      const offset = day === 1 ? 7 : (8 - day) % 7 || 7; // next Monday
      target.setDate(target.getDate() + offset);
      target.setHours(9, 0, 0, 0);
    }
    return snoozeUntil(email, target.toISOString());
  }

  async function deleteSelected() {
    if (!selected) return;
    if (!window.confirm(`Delete this email permanently?\n\n"${selected.subject || "(no subject)"}"\nfrom ${selected.from_email}\n\nThis cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch("/api/admin/emails", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": secret,
        },
        body: JSON.stringify({ id: selected.id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Delete failed");
      }
      const deletedId = selected.id;
      const idx = filtered.findIndex((e) => e.id === deletedId);
      const next = filtered[idx + 1] || filtered[idx - 1] || null;
      setSelectedId(next?.id ?? null);
      setEmails((prev) => prev.filter((e) => e.id !== deletedId));
      setTotal((t) => Math.max(0, t - 1));
      setComposeMode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  // Keystroke handler
  useEffect(() => {
    if (!authenticated) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const inField =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);

      // Cmd/Ctrl+K opens palette from anywhere
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        setPaletteQuery("");
        return;
      }
      // Esc closes overlays / cancels compose / clears search
      if (e.key === "Escape") {
        if (paletteOpen) return setPaletteOpen(false);
        if (helpOpen) return setHelpOpen(false);
        if (composeOpen) return setComposeOpen(false);
        if (composeMode) {
          setComposeMode(null);
          setReplyText("");
          setForwardTo("");
          setComposeCc("");
          return;
        }
        if (search) return setSearch("");
        return;
      }
      if (inField) return; // letter shortcuts only outside inputs

      const list = filtered;
      const idx = selected ? list.findIndex((e) => e.id === selected.id) : -1;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = list[Math.min(list.length - 1, idx + 1)];
        if (next) setSelectedId(next.id);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = list[Math.max(0, idx - 1)];
        if (prev) setSelectedId(prev.id);
        return;
      }
      if (e.key === "e" && selected) {
        e.preventDefault();
        toggleRead(selected);
        return;
      }
      if (e.key === "r" && selected) {
        e.preventDefault();
        openCompose("reply");
        return;
      }
      if (e.key === "f" && selected) {
        e.preventDefault();
        openCompose("forward");
        return;
      }
      if (e.key === "a" && selected) {
        e.preventDefault();
        openCompose("reply", { replyAll: true });
        return;
      }
      if (e.key === "s" && selected) {
        e.preventDefault();
        toggleStar(selected);
        return;
      }
      if (e.key === "h" && selected) {
        e.preventDefault();
        const choice = window.prompt(
          "Snooze until: 1 (1 hour) / 2 (tomorrow 9am) / 3 (weekend) / 4 (next Monday) / 0 (clear)",
          "2"
        );
        if (!choice) return;
        const map: Record<string, "1h" | "tomorrow" | "weekend" | "next-week" | "clear"> = {
          "1": "1h",
          "2": "tomorrow",
          "3": "weekend",
          "4": "next-week",
          "0": "clear",
        };
        const preset = map[choice.trim()];
        if (preset) snoozePreset(selected, preset);
        return;
      }
      if (e.key === "l" && selected) {
        e.preventDefault();
        const current = selected.labels.join(", ");
        const next = window.prompt(
          "Labels (comma-separated, max 20):",
          current
        );
        if (next === null) return;
        const arr = next
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        setLabels(selected, arr);
        return;
      }
      if (e.key === "c") {
        e.preventDefault();
        setComposeOpen(true);
        return;
      }
      if ((e.key === "#" || (e.shiftKey && e.key === "3")) && selected) {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "u") {
        e.preventDefault();
        setView((v) => (v === "unread" ? "all" : "unread"));
        setPage(1);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    filtered,
    selected,
    paletteOpen,
    helpOpen,
    composeMode,
    composeOpen,
    search,
    toggleRead,
    toggleStar,
  ]);

  // Auto-focus palette input
  useEffect(() => {
    if (paletteOpen) {
      setTimeout(() => paletteInputRef.current?.focus(), 0);
    }
  }, [paletteOpen]);

  // Scroll selected row into view
  useEffect(() => {
    if (!selectedId) return;
    const el = document.getElementById(`row-${selectedId}`);
    if (el && listScrollRef.current) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId]);

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
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-400"
            >
              {error}
            </div>
          )}
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="Password"
            aria-label="Admin inbox password"
            aria-invalid={!!error}
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

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-[1400px] mx-auto p-6">
        <AdminNav />

        {/* Header strip */}
        <header className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <InboxIcon className="h-5 w-5 text-amber-500" aria-hidden />
            <h1 className="text-xl font-bold text-white tracking-tight">
              Inbox
            </h1>
            <span className="text-xs text-zinc-500 ml-1">
              help@imnotanattorney.com
            </span>
          </div>

          <div className="flex items-center text-xs text-zinc-400 gap-3">
            <span>
              <span className="text-zinc-200 font-semibold">{total}</span> total
            </span>
            {unreadCount > 0 && (
              <span className="text-amber-400">
                <span className="font-semibold">{unreadCount}</span> unread
              </span>
            )}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"
              aria-hidden
            />
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search this page…"
              aria-label="Search loaded emails"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-9 pr-9 py-2 text-sm text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
            <kbd
              className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 font-mono"
              aria-hidden
            >
              /
            </kbd>
          </div>

          <button
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-black hover:bg-amber-400 transition-colors"
            title="Compose new (to known recipient)"
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden />
            <span>Compose</span>
            <kbd className="text-[10px] opacity-70">C</kbd>
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
            title="Command palette"
          >
            <Command className="h-3.5 w-3.5" aria-hidden />
            <span>K</span>
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
            title="Keyboard shortcuts"
            aria-label="Show keyboard shortcuts"
          >
            <Keyboard className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            onClick={fetchEmails}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
            title="Refresh"
            aria-label="Refresh inbox"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden
            />
          </button>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-800 bg-red-900/20 p-4 text-sm text-red-400"
          >
            {error}
          </div>
        )}

        {/* 2-pane body */}
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4 min-h-[640px]">
          {/* List pane */}
          <section
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col overflow-hidden"
            aria-label="Email list"
          >
            {/* Tabs */}
            <div
              role="tablist"
              aria-label="Filter"
              className="flex border-b border-zinc-800 bg-zinc-950/40 text-xs"
            >
              {(
                [
                  ["all", "All"],
                  ["unread", `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`],
                  ["starred", "Starred"],
                  ["snoozed", "Snoozed"],
                ] as Array<[View, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={view === key}
                  onClick={() => {
                    setView(key);
                    setPage(1);
                  }}
                  className={`flex-1 px-3 py-3 font-semibold uppercase tracking-wide transition-colors ${
                    view === key
                      ? "text-amber-500 border-b-2 border-amber-500"
                      : "text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Rows */}
            <div
              ref={listScrollRef}
              className="flex-1 overflow-y-auto"
              role="listbox"
              aria-label="Emails"
              tabIndex={-1}
            >
              {loading && emails.length === 0 ? (
                <p className="text-zinc-400 text-sm p-6" role="status">
                  Loading…
                </p>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-10 text-center">
                  <InboxIcon
                    className="h-8 w-8 text-zinc-700 mb-3"
                    aria-hidden
                  />
                  <p className="text-zinc-400 text-sm">
                    {search
                      ? "No matches on this page."
                      : view === "unread"
                        ? "No unread emails."
                        : view === "starred"
                          ? "No starred emails."
                          : view === "snoozed"
                            ? "No snoozed emails."
                            : "No emails yet."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {filtered.map((email) => {
                    const isSelected = selected?.id === email.id;
                    return (
                      <li key={email.id}>
                        <button
                          id={`row-${email.id}`}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            setSelectedId(email.id);
                            setComposeMode(null);
                            setReplyText("");
                            setForwardTo("");
                            setSendStatus(null);
                          }}
                          className={`w-full text-left px-4 py-3 transition-colors flex gap-3 items-start ${
                            isSelected
                              ? "bg-amber-500/10 border-l-2 border-amber-500"
                              : "hover:bg-zinc-800/50 border-l-2 border-transparent"
                          }`}
                        >
                          <Avatar
                            name={email.from_name}
                            email={email.from_email}
                            unread={!email.read}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span
                                className={`text-sm truncate ${
                                  email.read
                                    ? "text-zinc-300"
                                    : "text-white font-semibold"
                                }`}
                              >
                                {email.from_name || email.from_email}
                              </span>
                              <span className="text-[11px] text-zinc-500 whitespace-nowrap flex-shrink-0">
                                {formatDate(email.created_at)}
                              </span>
                            </div>
                            <p
                              className={`text-xs truncate mt-0.5 ${
                                email.read
                                  ? "text-zinc-400"
                                  : "text-zinc-200"
                              }`}
                            >
                              {email.subject || "(no subject)"}
                            </p>
                            {email.body_text && (
                              <p className="text-[11px] text-zinc-500 truncate mt-1 leading-relaxed">
                                {email.body_text.slice(0, 120)}
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-2 text-xs text-zinc-400 bg-zinc-950/40">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="inline-flex items-center gap-1 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Prev
                </button>
                <span>
                  Page {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="inline-flex items-center gap-1 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}
          </section>

          {/* Detail pane */}
          <section
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col overflow-hidden"
            aria-label="Email detail"
          >
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-6">
                  <div className="min-w-0 flex-1">
                    <h2
                      className="text-2xl font-bold text-white tracking-tight"
                      style={{ fontFamily: "var(--font-display), serif" }}
                    >
                      {selected.subject || "(no subject)"}
                    </h2>
                    <div className="flex items-center gap-3 mt-3">
                      <Avatar
                        name={selected.from_name}
                        email={selected.from_email}
                        size="lg"
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium truncate">
                          {selected.from_name || selected.from_email}
                        </p>
                        {selected.from_name && (
                          <p className="text-xs text-zinc-400 truncate">
                            {selected.from_email}
                          </p>
                        )}
                        <p className="text-xs text-zinc-500 mt-0.5">
                          to {selected.to_email} ·{" "}
                          {new Date(selected.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleStar(selected)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                        selected.starred
                          ? "border-amber-500 bg-amber-500/10 text-amber-400"
                          : "border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500"
                      }`}
                      title={selected.starred ? "Unstar" : "Star"}
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${selected.starred ? "fill-amber-400" : ""}`}
                        aria-hidden
                      />
                      <kbd className="text-[10px] opacity-70">S</kbd>
                    </button>
                    <button
                      onClick={() => openCompose("reply")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 transition-colors"
                    >
                      <Reply className="h-3.5 w-3.5" aria-hidden />
                      Reply <kbd className="ml-1 text-[10px] opacity-70">R</kbd>
                    </button>
                    {ccCount(selected) > 0 && (
                      <button
                        onClick={() => openCompose("reply", { replyAll: true })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                        title={`Reply all (${ccCount(selected)} cc)`}
                      >
                        <ReplyAll className="h-3.5 w-3.5" aria-hidden />
                        Reply all <kbd className="ml-1 text-[10px] opacity-70">A</kbd>
                      </button>
                    )}
                    <button
                      onClick={() => openCompose("forward")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                    >
                      <Forward className="h-3.5 w-3.5" aria-hidden />
                      Forward <kbd className="ml-1 text-[10px] opacity-70">F</kbd>
                    </button>
                    <SnoozeButton
                      onPick={(p) => snoozePreset(selected, p)}
                      isSnoozed={!!selected.snoozed_until}
                    />
                    <button
                      onClick={() => toggleRead(selected)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                    >
                      {selected.read ? (
                        <>
                          <Mail className="h-3.5 w-3.5" aria-hidden /> Mark
                          unread
                        </>
                      ) : (
                        <>
                          <MailOpen className="h-3.5 w-3.5" aria-hidden /> Mark
                          read
                        </>
                      )}
                      <kbd className="ml-1 text-[10px] opacity-70">E</kbd>
                    </button>
                    <button
                      onClick={deleteSelected}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/50 text-red-400 px-3 py-1.5 text-xs hover:bg-red-900/20 hover:border-red-700 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Delete <kbd className="ml-1 text-[10px] opacity-70">#</kbd>
                    </button>
                  </div>
                </div>

                {/* Labels row + snooze indicator */}
                <div className="flex items-center gap-2 px-6 py-2 border-b border-zinc-800 flex-wrap text-xs">
                  {selected.snoozed_until &&
                    new Date(selected.snoozed_until) > new Date() && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-blue-300">
                        <Clock className="h-3 w-3" aria-hidden />
                        Snoozed until{" "}
                        {new Date(selected.snoozed_until).toLocaleString()}
                        <button
                          onClick={() => snoozePreset(selected, "clear")}
                          className="ml-1 hover:text-white"
                          aria-label="Clear snooze"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    )}
                  <Tag
                    className="h-3 w-3 text-zinc-500 flex-shrink-0"
                    aria-hidden
                  />
                  {selected.labels.map((l) => (
                    <span
                      key={l}
                      className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-zinc-300"
                    >
                      {l}
                      <button
                        onClick={() =>
                          setLabels(
                            selected,
                            selected.labels.filter((x) => x !== l)
                          )
                        }
                        className="hover:text-red-400"
                        aria-label={`Remove label ${l}`}
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    </span>
                  ))}
                  <LabelAdder
                    existing={selected.labels}
                    onAdd={(l) =>
                      setLabels(selected, [...selected.labels, l].slice(0, 20))
                    }
                  />
                  <span className="ml-auto text-[10px] text-zinc-600">
                    L to edit
                  </span>
                </div>

                {/* Compose (reply or forward) */}
                {composeMode && (
                  <div className="border-b border-zinc-800 bg-zinc-950/40 p-6">
                    <div className="flex items-center gap-2 mb-2 text-xs text-zinc-400 flex-wrap">
                      {composeMode === "forward" ? (
                        <>
                          <Forward className="h-3.5 w-3.5" aria-hidden />
                          <span>Forwarding</span>
                        </>
                      ) : (
                        <>
                          <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />
                          <span>Replying to</span>
                          <span className="text-zinc-200 break-all">
                            {selected.from_email}
                          </span>
                        </>
                      )}
                    </div>
                    {composeMode === "forward" && (
                      <div className="flex items-center gap-2 mb-2 text-xs">
                        <label
                          htmlFor="forward-to"
                          className="text-zinc-500 flex-shrink-0"
                        >
                          To
                        </label>
                        <input
                          id="forward-to"
                          type="email"
                          value={forwardTo}
                          onChange={(e) => setForwardTo(e.target.value)}
                          placeholder="recipient@example.com"
                          className="flex-1 min-w-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    )}
                    {composeMode === "reply" && (
                      <div className="flex items-center gap-2 mb-2 text-xs">
                        <label
                          htmlFor="reply-cc"
                          className="text-zinc-500 flex-shrink-0"
                        >
                          Cc
                        </label>
                        <input
                          id="reply-cc"
                          type="text"
                          value={composeCc}
                          onChange={(e) => setComposeCc(e.target.value)}
                          placeholder="email1@x.com, email2@y.com (must be known contacts)"
                          className="flex-1 min-w-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    )}
                    {senders.length > 0 && (
                      <div className="flex items-center gap-2 mb-3 text-xs">
                        <label
                          htmlFor="reply-from"
                          className="text-zinc-500 flex-shrink-0"
                        >
                          From
                        </label>
                        <select
                          id="reply-from"
                          value={fromAddr}
                          onChange={(e) => setFromAddr(e.target.value)}
                          className="flex-1 min-w-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                        >
                          {senders.map((s) => (
                            <option key={s.email} value={s.email}>
                              {s.name ? `${s.name} <${s.email}>` : s.email}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <textarea
                      ref={replyTextareaRef}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={
                        composeMode === "forward"
                          ? "Add a message above the forwarded content…"
                          : "Type your reply…"
                      }
                      aria-label={composeMode === "forward" ? "Forward message" : "Reply message"}
                      rows={composeMode === "forward" ? 12 : 6}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none resize-y font-mono"
                    />
                    <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
                      <div className="flex gap-2">
                        <button
                          onClick={sendCompose}
                          disabled={
                            sending ||
                            !replyText.trim() ||
                            (composeMode === "forward" && !forwardTo.trim())
                          }
                          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {sending
                            ? "Sending…"
                            : composeMode === "forward"
                              ? "Send forward"
                              : "Send reply"}
                        </button>
                        <button
                          onClick={() => {
                            setComposeMode(null);
                            setReplyText("");
                            setForwardTo("");
                            setSendStatus(null);
                          }}
                          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                        >
                          Cancel <kbd className="ml-1 text-[10px] opacity-70">Esc</kbd>
                        </button>
                      </div>
                      {sendStatus && (
                        <span
                          className={`text-sm ${
                            sendStatus === "Sent!"
                              ? "text-green-500"
                              : "text-red-500"
                          }`}
                          role="status"
                        >
                          {sendStatus}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 min-w-0">
                  {selected.body_html ? (
                    <EmailBodyFrame html={selected.body_html} />
                  ) : selected.body_text ? (
                    <pre className="whitespace-pre-wrap break-words text-sm text-zinc-300 font-sans leading-relaxed">
                      {selected.body_text}
                    </pre>
                  ) : (
                    <p className="text-zinc-500 text-sm italic">
                      No content available.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-10 text-center">
                <InboxIcon
                  className="h-10 w-10 text-zinc-700 mb-4"
                  aria-hidden
                />
                <p className="text-zinc-400 text-sm">
                  Select an email to read
                </p>
                <p className="text-zinc-600 text-xs mt-2">
                  <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono">
                    J
                  </kbd>{" "}
                  /{" "}
                  <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono">
                    K
                  </kbd>{" "}
                  to navigate ·{" "}
                  <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono">
                    ?
                  </kbd>{" "}
                  for shortcuts
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {paletteOpen && (
        <CommandPalette
          emails={emails}
          query={paletteQuery}
          onQuery={setPaletteQuery}
          inputRef={paletteInputRef}
          onSelect={(id) => {
            setSelectedId(id);
            setPaletteOpen(false);
          }}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {composeOpen && (
        <ComposeNewModal
          secret={secret}
          senders={senders}
          fromDefault={fromAddr || senders[0]?.email || ""}
          onClose={() => setComposeOpen(false)}
          onSent={() => setComposeOpen(false)}
        />
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen bg-zinc-950 flex items-center justify-center"
          role="status"
        >
          <p className="text-zinc-400">Loading…</p>
        </div>
      }
    >
      <InboxContent />
    </Suspense>
  );
}

function Avatar({
  name,
  email,
  size = "md",
  unread = false,
}: {
  name: string | null;
  email: string;
  size?: "md" | "lg";
  unread?: boolean;
}) {
  const initials = useMemo(() => {
    const src = name || email;
    const parts = src.trim().split(/[\s@.]+/).filter(Boolean);
    return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
  }, [name, email]);
  const sz = size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";
  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${sz} rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-semibold`}
        aria-hidden
      >
        {initials}
      </div>
      {unread && (
        <span
          className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-zinc-900"
          aria-label="unread"
        />
      )}
    </div>
  );
}

function CommandPalette({
  emails,
  query,
  onQuery,
  inputRef,
  onSelect,
  onClose,
}: {
  emails: Email[];
  query: string;
  onQuery: (s: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? emails.filter((e) => {
          return (
            (e.from_name || "").toLowerCase().includes(q) ||
            e.from_email.toLowerCase().includes(q) ||
            (e.subject || "").toLowerCase().includes(q)
          );
        })
      : emails;
    return list.slice(0, 10);
  }, [emails, query]);

  const [cursor, setCursor] = useState(0);
  useEffect(() => setCursor(0), [query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[cursor];
      if (r) onSelect(r.id);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <Search className="h-4 w-4 text-zinc-500" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to email by sender or subject…"
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none"
            aria-label="Command palette query"
          />
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white"
            aria-label="Close palette"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <ul role="listbox" className="max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-zinc-500">
              No matches.
            </li>
          ) : (
            results.map((r, i) => (
              <li key={r.id}>
                <button
                  role="option"
                  aria-selected={i === cursor}
                  onClick={() => onSelect(r.id)}
                  onMouseEnter={() => setCursor(i)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 ${
                    i === cursor ? "bg-amber-500/10" : "hover:bg-zinc-800/50"
                  }`}
                >
                  <Avatar name={r.from_name} email={r.from_email} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">
                      {r.from_name || r.from_email}
                    </p>
                    <p className="text-xs text-zinc-400 truncate">
                      {r.subject || "(no subject)"}
                    </p>
                  </div>
                  {!r.read && (
                    <span className="h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-zinc-800 px-4 py-2 flex items-center justify-between text-[11px] text-zinc-500">
          <span>
            <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono">
              ↑↓
            </kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono">
              Enter
            </kbd>{" "}
            open
          </span>
          <span>
            <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono">
              Esc
            </kbd>{" "}
            close
          </span>
        </div>
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ["J / ↓", "Next email"],
    ["K / ↑", "Previous email"],
    ["E", "Toggle read / unread"],
    ["S", "Toggle star"],
    ["H", "Snooze (preset menu)"],
    ["L", "Edit labels"],
    ["R", "Reply"],
    ["A", "Reply all (when cc present)"],
    ["F", "Forward"],
    ["C", "Compose new (to known recipient)"],
    ["#", "Delete (with confirm)"],
    ["U", "Toggle unread view"],
    ["/", "Focus search"],
    ["⌘K / Ctrl+K", "Command palette"],
    ["Esc", "Close / cancel"],
    ["?", "This help"],
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-amber-500" aria-hidden />
            Keyboard shortcuts
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white"
            aria-label="Close help"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <dl className="space-y-2">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between text-sm py-1.5 border-b border-zinc-800 last:border-0"
            >
              <dt className="text-zinc-400">{v}</dt>
              <dd>
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-200">
                  {k}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/**
 * Render email body_html in a sandboxed iframe (industry standard for inbox UIs).
 * - sandbox without `allow-scripts` blocks JS execution from the email
 * - `allow-popups allow-popups-to-escape-sandbox` lets links open in new tabs
 * - srcDoc is same-origin, so we can measure body height for auto-resize
 * - `referrerpolicy="no-referrer"` prevents leaking our admin URL to tracking pixels
 * - sanitize-html still runs as defense-in-depth
 */
function EmailBodyFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);

  const safeHtml = useMemo(() => sanitizeHtml(html, SANITIZE_OPTIONS), [html]);

  const srcDoc = useMemo(
    () => `<!doctype html><html><head>
<meta charset="utf-8" />
<meta name="referrer" content="no-referrer" />
<meta http-equiv="Content-Security-Policy" content="script-src 'none'" />
<base target="_blank" />
<style>
  html, body { margin: 0; padding: 0; background: transparent; color: #d4d4d8; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 14px; line-height: 1.55; }
  a { color: #fbbf24; }
  a:hover { color: #f59e0b; }
  img { max-width: 100%; height: auto; }
  pre, code { white-space: pre-wrap; word-break: break-word; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
</style>
</head><body>${safeHtml}</body></html>`,
    [safeHtml]
  );

  function onLoad() {
    const f = ref.current;
    if (!f) return;
    try {
      const doc = f.contentDocument;
      if (!doc) return;
      const measure = () => {
        const h = Math.min(
          4000,
          Math.max(
            200,
            doc.documentElement.scrollHeight,
            doc.body?.scrollHeight || 0
          )
        );
        setHeight(h + 16);
      };
      measure();
      // Re-measure once images load (they pop in async)
      const imgs = doc.querySelectorAll("img");
      let pending = imgs.length;
      if (pending === 0) return;
      imgs.forEach((img) => {
        if ((img as HTMLImageElement).complete) {
          if (--pending === 0) measure();
        } else {
          img.addEventListener("load", () => { if (--pending === 0) measure(); }, { once: true });
          img.addEventListener("error", () => { if (--pending === 0) measure(); }, { once: true });
        }
      });
    } catch {
      // cross-origin guard, shouldn't trigger for srcDoc but fail-safe
    }
  }

  return (
    <iframe
      ref={ref}
      title="Email body"
      srcDoc={srcDoc}
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      referrerPolicy="no-referrer"
      onLoad={onLoad}
      style={{ width: "100%", height: `${height}px`, border: "0", background: "transparent" }}
    />
  );
}

function SnoozeButton({
  onPick,
  isSnoozed,
}: {
  onPick: (preset: "1h" | "tomorrow" | "weekend" | "next-week" | "clear") => void;
  isSnoozed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const presets: Array<{
    label: string;
    key: "1h" | "tomorrow" | "weekend" | "next-week" | "clear";
  }> = [
    { label: "In 1 hour", key: "1h" },
    { label: "Tomorrow 9 AM", key: "tomorrow" },
    { label: "This weekend", key: "weekend" },
    { label: "Next Monday", key: "next-week" },
  ];
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
          isSnoozed
            ? "border-blue-500/50 text-blue-300 bg-blue-500/10"
            : "border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500"
        }`}
        title="Snooze"
      >
        <Clock className="h-3.5 w-3.5" aria-hidden />
        Snooze <kbd className="ml-1 text-[10px] opacity-70">H</kbd>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                onPick(p.key);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              {p.label}
            </button>
          ))}
          {isSnoozed && (
            <button
              onClick={() => {
                onPick("clear");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-900/20 border-t border-zinc-800"
            >
              Unsnooze
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LabelAdder({
  existing,
  onAdd,
}: {
  existing: string[];
  onAdd: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  function commit() {
    const v = val.trim().slice(0, 40);
    if (v && !existing.includes(v)) onAdd(v);
    setVal("");
    setEditing(false);
  }
  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setVal("");
            setEditing(false);
          }
        }}
        placeholder="label"
        maxLength={40}
        className="rounded-full border border-amber-500 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-200 focus:outline-none w-24"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-600 px-2 py-0.5 text-zinc-500 hover:text-zinc-200 hover:border-zinc-400"
      aria-label="Add label"
    >
      <Plus className="h-3 w-3" aria-hidden />
      Add
    </button>
  );
}

function ComposeNewModal({
  secret,
  senders,
  fromDefault,
  onClose,
  onSent,
}: {
  secret: string;
  senders: SenderEntry[];
  fromDefault: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [from, setFrom] = useState(fromDefault);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<
    Array<{ email: string; name: string | null; source: "inbound" | "case" }>
  >([]);
  const [showSugg, setShowSugg] = useState(false);

  useEffect(() => {
    const q = to.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch("/api/admin/recipients?q=" + encodeURIComponent(q), {
        headers: { "X-Admin-Password": secret },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.recipients) setSuggestions(d.recipients);
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [to, secret]);

  async function send() {
    if (!to.trim() || !body.trim()) {
      setError("To and body are required");
      return;
    }
    setSending(true);
    setError(null);
    const ccList = cc
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    try {
      const res = await fetch("/api/admin/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": secret,
        },
        body: JSON.stringify({
          to: to.trim().toLowerCase(),
          cc: ccList,
          from,
          mode: "compose",
          subject: subject.trim() || "(no subject)",
          text: body.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Send failed");
      }
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center pt-[5vh] bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Compose new"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <PencilLine className="h-4 w-4 text-amber-500" aria-hidden />
            Compose new
            <span className="text-[10px] text-zinc-500 font-normal ml-1">
              recipient must be in known contacts
            </span>
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white"
            aria-label="Close compose"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="relative">
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="cn-to" className="text-zinc-500 w-12 flex-shrink-0">
                To
              </label>
              <input
                id="cn-to"
                type="email"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setShowSugg(true);
                }}
                onFocus={() => setShowSugg(true)}
                placeholder="known@email.com"
                className="flex-1 min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
            {showSugg && suggestions.length > 0 && (
              <ul className="absolute left-14 right-0 top-full mt-1 z-10 max-h-56 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-900 shadow-2xl">
                {suggestions.map((s) => (
                  <li key={s.email}>
                    <button
                      onClick={() => {
                        setTo(s.email);
                        setShowSugg(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800"
                    >
                      <span className="text-zinc-200">{s.email}</span>
                      {s.name && (
                        <span className="text-zinc-500"> — {s.name}</span>
                      )}
                      <span
                        className={`ml-2 text-[10px] uppercase ${
                          s.source === "case" ? "text-amber-500" : "text-zinc-500"
                        }`}
                      >
                        {s.source}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="cn-cc" className="text-zinc-500 w-12 flex-shrink-0">
              Cc
            </label>
            <input
              id="cn-cc"
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="(optional, comma-separated, must be known contacts)"
              className="flex-1 min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="cn-from" className="text-zinc-500 w-12 flex-shrink-0">
              From
            </label>
            <select
              id="cn-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="flex-1 min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
            >
              {senders.map((s) => (
                <option key={s.email} value={s.email}>
                  {s.name ? `${s.name} <${s.email}>` : s.email}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="cn-subj" className="text-zinc-500 w-12 flex-shrink-0">
              Subject
            </label>
            <input
              id="cn-subj"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="(no subject)"
              className="flex-1 min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={12}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-amber-500 focus:outline-none resize-y"
          />
        </div>
        <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-3 gap-3 flex-wrap">
          <div className="flex gap-2">
            <button
              onClick={send}
              disabled={sending || !to.trim() || !body.trim()}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? "Sending…" : "Send"}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
            >
              Cancel <kbd className="ml-1 text-[10px] opacity-70">Esc</kbd>
            </button>
          </div>
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / (1000 * 60 * 60);

  if (diffH < 1) return Math.round(diffMs / (1000 * 60)) + "m";
  if (diffH < 24) return Math.round(diffH) + "h";
  if (diffH < 48) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
