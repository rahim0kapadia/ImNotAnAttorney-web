"use client";
/**
 * Modal for partners to manually add a client.
 * 5 fields: name, email, charge type, county/state, court date.
 * Submits to /api/partner/add-client.
 */

import { useState } from "react";
import { CHARGE_DISPLAY_NAMES } from "@/lib/court-reminders";

interface AddClientModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CHARGE_OPTIONS = Object.entries(CHARGE_DISPLAY_NAMES).map(([slug, label]) => ({ slug, label }));

export function AddClientModal({ open, onClose, onSuccess }: AddClientModalProps) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [chargeType, setChargeType] = useState("");
  const [countyState, setCountyState] = useState("");
  const [courtDate, setCourtDate] = useState("");
  const [lastName, setLastName] = useState("");
  const [indemnitorName, setIndemnitorName] = useState("");
  const [indemnitorEmail, setIndemnitorEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/partner/add-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          email,
          charge_type: chargeType,
          county_state: countyState,
          court_date: courtDate,
          ...(lastName.trim() && { last_name: lastName.trim() }),
          ...(indemnitorName.trim() && { indemnitor_name: indemnitorName.trim() }),
          ...(indemnitorEmail.trim() && { indemnitor_email: indemnitorEmail.trim() }),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong");
        setSubmitting(false);
        return;
      }

      // Reset form + close
      setFirstName(""); setEmail(""); setChargeType(""); setCountyState(""); setCourtDate("");
      setLastName(""); setIndemnitorName(""); setIndemnitorEmail("");
      setSubmitting(false);
      onSuccess();
      onClose();
    } catch {
      setError("Connection error");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add a client"
      >
        <h3 className="text-lg font-bold text-amber-400 mb-4">Add a Client</h3>
        <p className="text-sm text-zinc-400 mb-4">
          We&apos;ll send them a court prep page and reminder emails automatically.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" required placeholder="Client first name" value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none text-sm"
            aria-label="Client first name" />
          <input type="email" required placeholder="Client email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none text-sm"
            aria-label="Client email" />
          <select required value={chargeType} onChange={(e) => setChargeType(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:border-amber-500 focus:outline-none text-sm"
            aria-label="Charge type">
            <option value="">Charge type</option>
            {CHARGE_OPTIONS.map(o => <option key={o.slug} value={o.slug}>{o.label}</option>)}
          </select>
          <input type="text" required placeholder="County & State (e.g. Pinellas County, FL)" value={countyState}
            onChange={(e) => setCountyState(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none text-sm"
            aria-label="County and state" />
          <input type="date" required value={courtDate} min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setCourtDate(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:border-amber-500 focus:outline-none text-sm"
            aria-label="Court date" />

          <p className="text-xs text-zinc-400 mt-3">Optional</p>
          <input type="text" placeholder="Client last name (optional)" value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none text-sm"
            aria-label="Client last name" />
          <input type="text" placeholder="Co-signer name (optional)" value={indemnitorName}
            onChange={(e) => setIndemnitorName(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none text-sm"
            aria-label="Co-signer name" />
          <input type="email" placeholder="Co-signer email (optional)" value={indemnitorEmail}
            onChange={(e) => setIndemnitorEmail(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none text-sm"
            aria-label="Co-signer email" />

          {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-300 rounded-lg text-sm hover:border-zinc-500 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 disabled:opacity-50 cursor-pointer">
              {submitting ? "Adding..." : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
