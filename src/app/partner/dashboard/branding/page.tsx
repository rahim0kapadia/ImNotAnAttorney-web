"use client";

/**
 * /partner/dashboard/branding — partner-facing white-label settings.
 *
 * Lets a partner set:
 *   - Website URL (drives Brandfetch CDN logo lookup)
 *   - Logo upload → Supabase Storage (partner-logos bucket)
 *   - Manual hex overrides (primary / accent / bg)
 *   - Color source provenance
 *
 * Enforces WCAG AA on primary color (server-side in the save route).
 */

import { useEffect, useState, useCallback, useId } from "react";
import Link from "next/link";
import { isHexColor, contrastRatio, brandPassesSiteContrast } from "@/lib/partner-branding/contrast-guard";
import { fetchLogoByDomain, normalizeDomain } from "@/lib/partner-branding/brandfetch-client";
import { extractPaletteFromUrl } from "@/lib/partner-branding/palette";

interface BrandingState {
  website_url: string;
  brand_color_primary: string;
  brand_color_accent: string;
  brand_color_bg: string;
  brand_color_source: "brandfetch" | "colorthief" | "manual" | "";
  logo_url: string;
  logo_storage_path: string;
}

const EMPTY: BrandingState = {
  website_url: "",
  brand_color_primary: "",
  brand_color_accent: "",
  brand_color_bg: "",
  brand_color_source: "",
  logo_url: "",
  logo_storage_path: "",
};

function LabeledHex({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputId = useId();
  const errId = `${inputId}-err`;
  const invalid = value.length > 0 && !isHexColor(value);
  const swatch = isHexColor(value) ? value : "#27272a";
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-sm font-semibold text-zinc-200">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-10 w-10 shrink-0 rounded border border-zinc-700"
          style={{ background: swatch }}
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#F59E0B"
          maxLength={7}
          aria-invalid={invalid}
          aria-describedby={invalid ? errId : undefined}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        />
      </div>
      {invalid ? (
        <p id={errId} className="mt-1 text-xs text-rose-300">
          Must be a 6-digit hex (e.g. #F59E0B).
        </p>
      ) : null}
    </div>
  );
}

export default function PartnerBrandingPage() {
  const [state, setState] = useState<BrandingState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [brandfetchPreview, setBrandfetchPreview] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string>("");
  const websiteInputId = useId();
  const fileInputId = useId();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/partner/dashboard", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const p = data?.partner;
        if (!p) return;
        setPromoCode(p.promo_code ?? "");
        setState({
          website_url: p.website_url ?? "",
          brand_color_primary: p.brand_color_primary ?? "",
          brand_color_accent: p.brand_color_accent ?? "",
          brand_color_bg: p.brand_color_bg ?? "",
          brand_color_source: p.brand_color_source ?? "",
          logo_url: p.logo_url ?? "",
          logo_storage_path: p.logo_storage_path ?? "",
        });
      } catch (e) {
        console.warn("[Branding] load failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBrandfetchLookup = useCallback(async () => {
    const domain = normalizeDomain(state.website_url);
    if (!domain) {
      setMessage({ kind: "error", text: "Enter a valid website URL." });
      return;
    }
    setBrandfetchPreview(null);
    setMessage(null);
    const found = await fetchLogoByDomain(domain);
    if (!found) {
      // Don't preview a generic fallback while telling the user "no match."
      // Contradictory state — send them to the upload path instead.
      setBrandfetchPreview(null);
      setMessage({
        kind: "error",
        text: "Brandfetch has no logo for that domain. Upload one directly below.",
      });
      return;
    }
    setBrandfetchPreview(found.pngUrl);
    setState((s) => ({
      ...s,
      logo_url: found.pngUrl,
      logo_storage_path: "",
      brand_color_source: "brandfetch",
    }));
    try {
      const palette = await extractPaletteFromUrl(found.pngUrl);
      if (palette) {
        setState((s) => ({
          ...s,
          brand_color_primary: palette.primary,
          brand_color_accent: palette.accent,
          brand_color_source: "colorthief",
        }));
      }
    } catch (e) {
      console.warn("[Branding] extract failed", e);
    }
  }, [state.website_url]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ kind: "error", text: "Max file size 2MB." });
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setMessage(null);
    try {
      const res = await fetch("/api/partner/branding/upload", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: "error", text: data?.error ?? "Upload failed." });
        return;
      }
      setState((s) => ({
        ...s,
        logo_url: data.publicUrl,
        logo_storage_path: data.storagePath,
        brand_color_source: "manual",
      }));
      try {
        const palette = await extractPaletteFromUrl(data.publicUrl);
        if (palette) {
          setState((s) => ({
            ...s,
            brand_color_primary: s.brand_color_primary || palette.primary,
            brand_color_accent: s.brand_color_accent || palette.accent,
            brand_color_source: s.brand_color_primary ? s.brand_color_source : "colorthief",
          }));
        } else {
          setMessage({
            kind: "error",
            text: "Logo saved. Couldn't auto-detect colors — set them manually below.",
          });
        }
      } catch {
        // Extraction is best-effort (CORS, canvas, Color Thief edge cases);
        // surface a soft message so the partner knows to pick colors.
        setMessage({
          kind: "error",
          text: "Logo saved. Couldn't auto-detect colors — set them manually below.",
        });
      }
    } catch (e) {
      console.warn("[Branding] upload failed", e);
      setMessage({ kind: "error", text: "Upload failed." });
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, string | null> = {
        website_url: state.website_url || null,
        brand_color_primary: state.brand_color_primary || null,
        brand_color_accent: state.brand_color_accent || null,
        brand_color_bg: state.brand_color_bg || null,
        brand_color_source: state.brand_color_source || null,
        logo_url: state.logo_url || null,
        logo_storage_path: state.logo_storage_path || null,
      };
      const res = await fetch("/api/partner/branding/save", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: "error", text: data?.error ?? "Save failed." });
        return;
      }
      // The save route returns 422 (handled above) when a primary color
      // was attempted and failed contrast, so here we only see 200s. If
      // brand_contrast_passed is still false, the partner hasn't picked a
      // primary color yet — message should guide that, not imply a
      // failed contrast check.
      setMessage({
        kind: "ok",
        text: data.brand_contrast_passed
          ? "Saved. Your brand is live on your referral link."
          : "Saved. Pick a primary color below to switch from the default ImNotAnAttorney brand.",
      });
    } catch (e) {
      console.warn("[Branding] save failed", e);
      setMessage({ kind: "error", text: "Save failed." });
    } finally {
      setSaving(false);
    }
  }, [state]);

  const contrastRow = isHexColor(state.brand_color_primary)
    ? {
        onBlack: contrastRatio(state.brand_color_primary, "#000000"),
        onWhite: contrastRatio(state.brand_color_primary, "#FFFFFF"),
        passes: brandPassesSiteContrast(state.brand_color_primary),
      }
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-100">
      <div className="mb-6">
        <Link
          href="/partner/dashboard"
          className="inline-flex min-h-[44px] items-center text-sm text-amber-400 hover:text-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          ← Back to dashboard
        </Link>
      </div>
      <h1 className="font-display mb-2 text-3xl font-bold text-white">Your brand on the referral page</h1>
      <p className="mb-4 text-sm text-zinc-300">
        The page your folks see when you text them our link. Upload your logo
        and pick your colors so the first screen feels like yours.
      </p>
      <p className="mb-8 rounded border border-zinc-700 bg-zinc-900/50 p-3 text-xs text-zinc-300">
        Your brand brings them in. ImNotAnAttorney handles the research and
        delivery &mdash; their report comes from us, so the legal disclaimers
        are ours to own. Only the referral landing and reminder pages render
        your brand; the quiz, checkout, and final report stay on
        ImNotAnAttorney. You are not providing legal services.
      </p>

      {loading ? (
        <p role="status" aria-live="polite" className="text-zinc-300">
          Loading…
        </p>
      ) : (
        <div className="space-y-8">
          <section className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-5">
            <h2 className="font-display mb-3 text-xl font-bold text-white">Website lookup</h2>
            <label htmlFor={websiteInputId} className="mb-1 block text-sm font-semibold text-zinc-200">
              Partner website URL
            </label>
            <div className="flex gap-2">
              <input
                id={websiteInputId}
                type="url"
                value={state.website_url}
                onChange={(e) => setState((s) => ({ ...s, website_url: e.target.value }))}
                placeholder="https://yourbailbonds.com"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              />
              <button
                type="button"
                onClick={handleBrandfetchLookup}
                aria-label="Autofill logo and colors from website URL"
                className="min-h-[44px] rounded bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                Autofill
              </button>
            </div>
            {brandfetchPreview ? (
              <div className="mt-4">
                <p className="mb-2 text-xs uppercase tracking-wider text-zinc-400">Brandfetch preview</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={brandfetchPreview}
                  alt="Brandfetch logo preview"
                  width={128}
                  height={64}
                  className="h-16 w-auto rounded border border-zinc-700 bg-black p-2"
                />
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-5">
            <h2 className="font-display mb-3 text-xl font-bold text-white">Or upload a logo</h2>
            <label htmlFor={fileInputId} className="mb-1 block text-sm font-semibold text-zinc-200">
              Upload partner logo
            </label>
            <input
              id={fileInputId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="block w-full text-sm text-zinc-200 file:mr-4 file:rounded file:border-0 file:bg-amber-500 file:px-4 file:py-2 file:text-sm file:font-bold file:text-black hover:file:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            />
            <p className="mt-2 text-xs text-zinc-400">PNG / JPG / WEBP up to 2MB. SVG is not supported.</p>
            {state.logo_url ? (
              <div className="mt-4">
                <p className="mb-2 text-xs uppercase tracking-wider text-zinc-400">Current logo</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={state.logo_url}
                  alt="Current partner logo"
                  width={128}
                  height={64}
                  className="h-16 w-auto rounded border border-zinc-700 bg-black p-2"
                />
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-5">
            <h2 className="font-display mb-3 text-xl font-bold text-white">Colors</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <LabeledHex
                label="Primary"
                value={state.brand_color_primary}
                onChange={(v) => setState((s) => ({ ...s, brand_color_primary: v, brand_color_source: "manual" }))}
              />
              <LabeledHex
                label="Accent"
                value={state.brand_color_accent}
                onChange={(v) => setState((s) => ({ ...s, brand_color_accent: v, brand_color_source: "manual" }))}
              />
              <LabeledHex
                label="Background (optional)"
                value={state.brand_color_bg}
                onChange={(v) => setState((s) => ({ ...s, brand_color_bg: v, brand_color_source: "manual" }))}
              />
            </div>
            {contrastRow ? (
              <div
                role="status"
                aria-live="polite"
                className="mt-4 rounded border border-zinc-700 bg-zinc-950 p-3 text-xs"
              >
                <p className="text-zinc-200">
                  Contrast on black:{" "}
                  <strong className={contrastRow.onBlack >= 4.5 ? "text-emerald-300" : "text-rose-300"}>
                    {contrastRow.onBlack >= 4.5 ? "Pass — " : "Fail — "}
                    {contrastRow.onBlack.toFixed(2)}:1
                  </strong>
                </p>
                <p className="mt-1 text-zinc-200">
                  Contrast on white:{" "}
                  <strong className={contrastRow.onWhite >= 4.5 ? "text-emerald-300" : "text-rose-300"}>
                    {contrastRow.onWhite >= 4.5 ? "Pass — " : "Fail — "}
                    {contrastRow.onWhite.toFixed(2)}:1
                  </strong>
                </p>
                <p className="mt-2 text-zinc-300">
                  {contrastRow.passes
                    ? "Passes WCAG AA against the INAA dark canvas. Safe to ship."
                    : "Fails WCAG AA (4.5:1) against the INAA dark canvas (#000). Pick a lighter or more saturated primary."}
                </p>
              </div>
            ) : null}
          </section>

          {message ? (
            <div
              role={message.kind === "error" ? "alert" : "status"}
              aria-live={message.kind === "error" ? "assertive" : "polite"}
              className={
                message.kind === "ok"
                  ? "rounded border border-emerald-700 bg-emerald-900/30 p-3 text-sm text-emerald-100"
                  : "rounded border border-rose-700 bg-rose-900/30 p-3 text-sm text-rose-100"
              }
            >
              {message.text}
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              aria-disabled={saving}
              className="min-h-[44px] rounded bg-amber-500 px-5 py-3 text-sm font-bold text-black hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:bg-amber-500/60 disabled:text-black/80"
            >
              {saving ? "Saving…" : "Save branding"}
            </button>
            {promoCode ? (
              <Link
                href={`/r/${promoCode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center text-sm text-amber-400 underline decoration-amber-400/50 hover:text-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                See it live &rarr;
              </Link>
            ) : null}
            <Link
              href="/partner/dashboard"
              className="inline-flex min-h-[44px] items-center text-sm text-zinc-300 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              Cancel
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
