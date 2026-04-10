"use client";
/**
 * /admin/partners — Bondsman Partner Management Dashboard
 *
 * Create/manage bondsman partners, generate promo codes, view referrals,
 * track payouts. Auth: ADMIN_PASSWORD via sessionStorage + X-Admin-Password header.
 */

import { useEffect, useState, useCallback } from "react";
import { AdminNav } from "@/components/AdminNav";
import { formatCents, formatDate } from "@/lib/format";

interface Partner {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  region: string | null;
  status: string;
  commission_rate: number;
  promo_code: string | null;
  stripe_promo_code_id: string | null;
  notes: string | null;
  total_referrals: number;
  total_commission: number;
  total_paid_out: number;
  unpaid_commission: number;
  created_at: string;
}

interface Referral {
  id: string;
  tier: string;
  sale_amount: number;
  discount_amount: number;
  commission_amount: number;
  commission_paid: boolean;
  paid_at: string | null;
  created_at: string;
}

export default function PartnersAdmin() {
  const [password, setPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formRegion, setFormRegion] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const headers = useCallback(
    (): HeadersInit => ({
      "X-Admin-Password": password,
      "Content-Type": "application/json",
    }),
    [password]
  );

  // Restore session
  useEffect(() => {
    const stored = sessionStorage.getItem("admin-password");
    if (stored) {
      setPassword(stored);
      setAuthed(true);
    }
  }, []);

  // Fetch partners list
  const fetchPartners = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/partners", { headers: headers() });
      if (res.status === 401) {
        setAuthed(false);
        setPassword("");
        sessionStorage.removeItem("admin-password");
        return;
      }
      if (!res.ok) throw new Error("Failed to load partners");
      const data = await res.json();
      setPartners(data.partners || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [password, headers]);

  useEffect(() => {
    if (authed) fetchPartners();
  }, [authed, fetchPartners]);

  // Fetch partner detail
  const fetchDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/admin/partners/${id}`, {
          headers: headers(),
        });
        if (!res.ok) throw new Error("Failed to load detail");
        const data = await res.json();
        setSelectedPartner(data.partner);
        setReferrals(data.referrals || []);
      } catch {
        setError("Failed to load partner detail");
      } finally {
        setDetailLoading(false);
      }
    },
    [headers]
  );

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  // Login
  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    sessionStorage.setItem("admin-password", passwordInput.trim());
    setPassword(passwordInput.trim());
    setAuthed(true);
    setPasswordInput("");
  }

  // Create partner
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/partners", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: formName,
          company: formCompany || undefined,
          email: formEmail,
          phone: formPhone || undefined,
          region: formRegion || undefined,
          promoCode: formCode || undefined,
          notes: formNotes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create partner");
      }
      // Reset form and refresh
      setFormName("");
      setFormCompany("");
      setFormEmail("");
      setFormPhone("");
      setFormRegion("");
      setFormCode("");
      setFormNotes("");
      setShowCreate(false);
      fetchPartners();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  }

  // Toggle status
  async function toggleStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === "approved" ? "suspended" : "approved";
    try {
      const res = await fetch(`/api/admin/partners/${id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${newStatus} partner`);
      }
      fetchPartners();
      if (selectedId === id) fetchDetail(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update partner status");
    }
  }

  // Mark payout
  async function markPayout(id: string) {
    try {
      const res = await fetch(`/api/admin/partners/${id}`, {
        method: "POST",
        headers: headers(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to process payout");
      }
      fetchPartners();
      if (selectedId === id) fetchDetail(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to process payout");
    }
  }

  // ── Login Screen ──
  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <form
          onSubmit={handleLogin}
          className="bg-zinc-900 p-8 rounded-xl border border-zinc-500 w-full max-w-sm"
        >
          <h1 className="text-xl font-bold text-white mb-4">Partner Admin</h1>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Admin password"
            aria-label="Partner admin password"
            className="w-full px-4 py-2 bg-zinc-800 text-white rounded-lg border border-zinc-700 mb-4"
          />
          <button
            type="submit"
            className="w-full py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  // ── Detail View ──
  if (selectedId && selectedPartner) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-6">
        <AdminNav />
        <button
          onClick={() => {
            setSelectedId(null);
            setSelectedPartner(null);
          }}
          className="text-amber-400 hover:text-amber-300 mb-4"
        >
          &larr; Back to all partners
        </button>

        {detailLoading ? (
          <p className="text-zinc-400" role="status">Loading...</p>
        ) : (
          <>
            <div className="bg-zinc-900 rounded-xl border border-zinc-500 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold">{selectedPartner.name}</h1>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    selectedPartner.status === "approved"
                      ? "bg-green-900 text-green-300"
                      : selectedPartner.status === "suspended"
                      ? "bg-red-900 text-red-300"
                      : "bg-yellow-900 text-yellow-300"
                  }`}
                >
                  {selectedPartner.status}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-zinc-400">Email</p>
                  <p>{selectedPartner.email}</p>
                </div>
                <div>
                  <p className="text-zinc-400">Phone</p>
                  <p>{selectedPartner.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-zinc-400">Company</p>
                  <p>{selectedPartner.company || "—"}</p>
                </div>
                <div>
                  <p className="text-zinc-400">Region</p>
                  <p>{selectedPartner.region || "—"}</p>
                </div>
                <div>
                  <p className="text-zinc-400">Promo Code</p>
                  <p className="font-mono text-amber-400">
                    {selectedPartner.promo_code || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">Commission Rate</p>
                  <p>{selectedPartner.commission_rate}%</p>
                </div>
                <div>
                  <p className="text-zinc-400">Total Referrals</p>
                  <p>{selectedPartner.total_referrals}</p>
                </div>
                <div>
                  <p className="text-zinc-400">Unpaid Commission</p>
                  <p className="text-amber-400 font-bold">
                    {formatCents(selectedPartner.unpaid_commission)}
                  </p>
                </div>
              </div>

              {selectedPartner.notes && (
                <div className="mt-4">
                  <p className="text-zinc-400 text-sm">Notes</p>
                  <p className="text-zinc-300">{selectedPartner.notes}</p>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() =>
                    toggleStatus(selectedPartner.id, selectedPartner.status)
                  }
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    selectedPartner.status === "approved"
                      ? "bg-red-900 text-red-300 hover:bg-red-800"
                      : "bg-green-900 text-green-300 hover:bg-green-800"
                  }`}
                >
                  {selectedPartner.status === "approved"
                    ? "Suspend"
                    : "Approve"}
                </button>
                {selectedPartner.unpaid_commission > 0 && (
                  <button
                    onClick={() => markPayout(selectedPartner.id)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-black hover:bg-amber-500"
                  >
                    Mark Payout ({formatCents(selectedPartner.unpaid_commission)}
                    )
                  </button>
                )}
              </div>
            </div>

            {/* Referral History */}
            <h2 className="text-lg font-bold mb-3">Referral History</h2>
            {referrals.length === 0 ? (
              <p className="text-zinc-400">No referrals yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Partner referral history with sales and commissions</caption>
                  <thead>
                    <tr className="text-zinc-400 border-b border-zinc-500">
                      <th scope="col" className="text-left py-2 pr-4">Date</th>
                      <th scope="col" className="text-left py-2 pr-4">Tier</th>
                      <th scope="col" className="text-right py-2 pr-4">Sale</th>
                      <th scope="col" className="text-right py-2 pr-4">Discount</th>
                      <th scope="col" className="text-right py-2 pr-4">Commission</th>
                      <th scope="col" className="text-left py-2">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-zinc-500/50"
                      >
                        <td className="py-2 pr-4">
                          {formatDate(r.created_at)}
                        </td>
                        <td className="py-2 pr-4">{r.tier}</td>
                        <td className="py-2 pr-4 text-right">
                          {formatCents(r.sale_amount)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {formatCents(r.discount_amount)}
                        </td>
                        <td className="py-2 pr-4 text-right text-amber-400">
                          {formatCents(r.commission_amount)}
                        </td>
                        <td className="py-2">
                          {r.commission_paid ? (
                            <span className="text-green-400">
                              Paid {r.paid_at ? formatDate(r.paid_at) : ""}
                            </span>
                          ) : (
                            <span className="text-zinc-400">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Main Dashboard ──
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <AdminNav />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Partners</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400"
        >
          {showCreate ? "Cancel" : "+ New Partner"}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-lg mb-4">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-400 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create Partner Form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-zinc-900 rounded-xl border border-zinc-500 p-6 mb-6"
        >
          <h2 className="text-lg font-bold mb-4">Create New Partner</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="admin-partner-name" className="block text-sm text-zinc-400 mb-1">
                Name *
              </label>
              <input
                id="admin-partner-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label htmlFor="admin-partner-company" className="block text-sm text-zinc-400 mb-1">
                Company
              </label>
              <input
                id="admin-partner-company"
                type="text"
                value={formCompany}
                onChange={(e) => setFormCompany(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label htmlFor="admin-partner-email" className="block text-sm text-zinc-400 mb-1">
                Email *
              </label>
              <input
                id="admin-partner-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label htmlFor="admin-partner-phone" className="block text-sm text-zinc-400 mb-1">Phone</label>
              <input
                id="admin-partner-phone"
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label htmlFor="admin-partner-region" className="block text-sm text-zinc-400 mb-1">
                Region
              </label>
              <input
                id="admin-partner-region"
                type="text"
                value={formRegion}
                onChange={(e) => setFormRegion(e.target.value)}
                placeholder="e.g., Maricopa County, AZ"
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label htmlFor="admin-partner-code" className="block text-sm text-zinc-400 mb-1">
                Promo Code (optional)
              </label>
              <input
                id="admin-partner-code"
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="Auto-generated if blank"
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white font-mono"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="admin-partner-notes" className="block text-sm text-zinc-400 mb-1">Notes</label>
              <textarea
                id="admin-partner-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="mt-4 px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Partner + Generate Code"}
          </button>
        </form>
      )}

      {/* Summary Stats */}
      {partners.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-zinc-900 rounded-xl border border-zinc-500 p-4">
            <p className="text-zinc-400 text-sm">Total Partners</p>
            <p className="text-2xl font-bold">{partners.length}</p>
          </div>
          <div className="bg-zinc-900 rounded-xl border border-zinc-500 p-4">
            <p className="text-zinc-400 text-sm">Active</p>
            <p className="text-2xl font-bold text-green-400">
              {partners.filter((p) => p.status === "approved").length}
            </p>
          </div>
          <div className="bg-zinc-900 rounded-xl border border-zinc-500 p-4">
            <p className="text-zinc-400 text-sm">Total Referrals</p>
            <p className="text-2xl font-bold">
              {partners.reduce((sum, p) => sum + (p.total_referrals || 0), 0)}
            </p>
          </div>
          <div className="bg-zinc-900 rounded-xl border border-zinc-500 p-4">
            <p className="text-zinc-400 text-sm">Unpaid Commission</p>
            <p className="text-2xl font-bold text-amber-400">
              {formatCents(
                partners.reduce((sum, p) => sum + (p.unpaid_commission || 0), 0)
              )}
            </p>
          </div>
        </div>
      )}

      {/* Partners Table */}
      {loading ? (
        <p className="text-zinc-400" role="status">Loading partners...</p>
      ) : partners.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          <p className="text-lg">No partners yet.</p>
          <p className="text-sm mt-1">
            Click &quot;+ New Partner&quot; to add your first bondsman.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">All partners with referral counts and commission status</caption>
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-500">
                <th scope="col" className="text-left py-3 pr-4">Partner</th>
                <th scope="col" className="text-left py-3 pr-4">Code</th>
                <th scope="col" className="text-left py-3 pr-4">Status</th>
                <th scope="col" className="text-right py-3 pr-4">Referrals</th>
                <th scope="col" className="text-right py-3 pr-4">Commission</th>
                <th scope="col" className="text-right py-3 pr-4">Unpaid</th>
                <th scope="col" className="text-left py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-zinc-500/50 hover:bg-zinc-900/50"
                >
                  <td className="py-3 pr-4">
                    <button
                      onClick={() => setSelectedId(p.id)}
                      className="text-left hover:text-amber-400"
                    >
                      <p className="font-medium">{p.name}</p>
                      <p className="text-zinc-400 text-xs">{p.email}</p>
                    </button>
                  </td>
                  <td className="py-3 pr-4 font-mono text-amber-400">
                    {p.promo_code || "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.status === "approved"
                          ? "bg-green-900 text-green-300"
                          : p.status === "suspended"
                          ? "bg-red-900 text-red-300"
                          : "bg-yellow-900 text-yellow-300"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {p.total_referrals}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {formatCents(p.total_commission)}
                  </td>
                  <td className="py-3 pr-4 text-right text-amber-400 font-medium">
                    {formatCents(p.unpaid_commission)}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleStatus(p.id, p.status)}
                        className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
                      >
                        {p.status === "approved" ? "Suspend" : "Approve"}
                      </button>
                      {p.unpaid_commission > 0 && (
                        <button
                          onClick={() => markPayout(p.id)}
                          className="text-xs px-2 py-1 rounded bg-amber-900 text-amber-300 hover:bg-amber-800"
                        >
                          Payout
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
