'use client';

/**
 * AvailabilityChecker — pre-purchase data availability gate for Tier 9 standalone SKUs.
 *
 * Checks whether we have enough data to generate a report for the user's
 * specific judge/officer/charge + state combination. If unavailable, captures
 * email for waitlist notification.
 *
 * States: idle -> checking -> available | unavailable | error
 *         unavailable -> waitlisted (after email submit)
 *
 * Accessibility (WCAG AA):
 *   - All inputs have associated <label> elements with htmlFor
 *   - Required fields marked with aria-required + visible asterisk (aria-hidden)
 *   - Error messages use role="alert" + aria-live="polite"
 *   - Loading state uses aria-busy="true" on form wrapper
 *   - Coverage stats rendered as <dl> with <dt>/<dd> pairs
 *   - All interactive hit areas >= 44px (h-12 minimum)
 *   - Focus rings offset against zinc-950 background
 *   - Focus managed on state transitions via refs
 *   - Spinner SVG has aria-hidden="true"
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/* ────────────────────────────────────────────────────────── */
/* Constants                                                   */
/* ────────────────────────────────────────────────────────── */

const US_STATES = [
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' }, { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'District of Columbia' }, { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' }, { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' }, { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' }, { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' }, { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' }, { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' }, { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' }, { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' }, { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

const CHARGE_TYPES = [
  { value: 'drug-possession', label: 'Drug Possession' },
  { value: 'drug-trafficking', label: 'Drug Trafficking' },
  { value: 'dui', label: 'DUI / DWI' },
  { value: 'dui-first', label: 'DUI — First Offense' },
  { value: 'dui-repeat', label: 'DUI — Repeat Offense' },
  { value: 'assault', label: 'Assault' },
  { value: 'domestic-violence', label: 'Domestic Violence' },
  { value: 'theft', label: 'Theft / Larceny' },
  { value: 'white-collar', label: 'White Collar / Financial Crime' },
  { value: 'sex-offense', label: 'Sex Offense' },
  { value: 'sex-offense-contact', label: 'Sex Offense — Contact' },
  { value: 'sex-offense-digital', label: 'Sex Offense — Digital / Possession' },
  { value: 'weapons', label: 'Weapons Charge' },
  { value: 'federal', label: 'Federal Charge' },
  { value: 'probation-violation', label: 'Probation Violation' },
  { value: 'self-defense', label: 'Self-Defense Claim' },
  { value: 'other', label: 'Other' },
];

/** Human-readable labels for coverage keys returned by the API. */
const COVERAGE_LABELS: Record<string, string> = {
  quotes: 'court opinions analyzed',
  sentencing: 'sentencing records found',
  pairings: 'prosecutor pairing analyses',
  appellate: 'appellate cases reviewed',
  benchJury: 'bench vs jury comparisons',
  officers: 'cross-case reliability records',
  similarCases: 'similar cases matched',
};

const LOCALSTORAGE_KEY = 'inna_email';

/* ────────────────────────────────────────────────────────── */
/* Types                                                       */
/* ────────────────────────────────────────────────────────── */

type Slug = 'judge-report-card' | 'officer-background-check' | 'similar-cases-analyzer';

interface AvailabilityCheckerProps {
  slug: Slug;
  productName: string;
  priceDisplay: string;
}

type ComponentState = 'idle' | 'checking' | 'available' | 'unavailable' | 'waitlisted' | 'error';

interface CoverageResponse {
  available: boolean;
  coverage: Record<string, number>;
  matchedName: string | null;
  matchedCourt: string | null;
  waitlisted?: boolean;
  error?: string;
}

/* ────────────────────────────────────────────────────────── */
/* Styles                                                      */
/* ────────────────────────────────────────────────────────── */

const inputClass =
  'w-full bg-zinc-900 border border-zinc-500 rounded-lg px-4 py-3 text-white placeholder-zinc-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-950 ' +
  'transition-colors min-h-[44px]';

const labelClass = 'block text-sm font-medium text-zinc-300 mb-1.5';

const primaryBtnClass =
  'w-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:cursor-not-allowed ' +
  'text-black font-semibold rounded-lg transition-colors h-12 text-lg ' +
  'focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-950';

/* ────────────────────────────────────────────────────────── */
/* Component                                                   */
/* ────────────────────────────────────────────────────────── */

export default function AvailabilityChecker({ slug, productName, priceDisplay }: AvailabilityCheckerProps) {
  const [componentState, setComponentState] = useState<ComponentState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [coverage, setCoverage] = useState<Record<string, number>>({});
  const [matchedName, setMatchedName] = useState<string | null>(null);

  // Intake fields
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [chargeType, setChargeType] = useState('');

  // Waitlist
  const [email, setEmail] = useState('');

  // Refs for focus management
  const errorRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  // Pre-fill email from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCALSTORAGE_KEY);
      if (saved) setEmail(saved);
    } catch {
      // localStorage unavailable (SSR, privacy mode)
    }
  }, []);

  /* ── Availability check ── */

  const handleCheck = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setComponentState('checking');

    const payload: Record<string, string> = { state };
    if (slug === 'judge-report-card') payload.judgeName = name;
    else if (slug === 'officer-background-check') payload.officerName = name;
    else payload.chargeType = chargeType;

    try {
      const res = await fetch(`/api/check-availability/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Something went wrong' }));
        throw new Error(data.error || `Server error (${res.status})`);
      }

      const data: CoverageResponse = await res.json();
      setCoverage(data.coverage);
      setMatchedName(data.matchedName);
      setComponentState(data.available ? 'available' : 'unavailable');
      setTimeout(() => resultRef.current?.focus(), 50);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setComponentState('error');
      setTimeout(() => errorRef.current?.focus(), 50);
    }
  }, [slug, name, state, chargeType]);

  /* ── Waitlist submit ── */

  const handleWaitlist = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setComponentState('checking');

    const payload: Record<string, unknown> = { state, email, waitlist: true };
    if (slug === 'judge-report-card') payload.judgeName = name;
    else if (slug === 'officer-background-check') payload.officerName = name;
    else payload.chargeType = chargeType;

    try {
      const res = await fetch(`/api/check-availability/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Something went wrong' }));
        throw new Error(data.error || `Server error (${res.status})`);
      }

      const data: CoverageResponse = await res.json();
      if (data.waitlisted) {
        try {
          localStorage.setItem(LOCALSTORAGE_KEY, email);
        } catch {
          // localStorage unavailable
        }
        setComponentState('waitlisted');
        setTimeout(() => resultRef.current?.focus(), 50);
      } else {
        throw new Error('Waitlist registration failed. Please try again.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setComponentState('error');
      setTimeout(() => errorRef.current?.focus(), 50);
    }
  }, [slug, name, state, chargeType, email]);

  /* ── Retry from error ── */

  const handleRetry = useCallback(() => {
    setErrorMsg('');
    setComponentState('idle');
    setTimeout(() => firstInputRef.current?.focus(), 50);
  }, []);

  /* ── Build checkout URL ── */

  function buildCheckoutUrl(): string {
    const params = new URLSearchParams({ standaloneProduct: slug });
    if (slug === 'judge-report-card') params.set('judgeName', name);
    if (slug === 'officer-background-check') params.set('officerName', name);
    params.set('state', state);
    if (slug === 'similar-cases-analyzer') params.set('chargeType', chargeType);
    return `/checkout?${params.toString()}`;
  }

  /* ── ID prefix for unique htmlFor bindings ── */
  const id = `ac-${slug}`;

  /* ──────────────────────── RENDER ──────────────────────── */

  /* Available state */
  if (componentState === 'available') {
    const entries = Object.entries(coverage).filter(([, count]) => count > 0);

    return (
      <div
        ref={resultRef}
        tabIndex={-1}
        role="status"
        className="bg-green-950/30 border border-green-800 rounded-lg p-8"
      >
        <h3 className="text-xl font-display font-bold text-green-400 mb-2">
          Data available{matchedName ? ` for ${matchedName}` : ''}
        </h3>
        <p className="text-zinc-300 text-sm mb-6">
          We have enough data to generate your {productName}. Here is what we found:
        </p>

        {entries.length > 0 && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-8">
            {entries.map(([key, count]) => (
              <div key={key} className="flex items-baseline gap-2">
                <dd className="text-2xl font-bold text-amber-500 tabular-nums">
                  {count.toLocaleString()}
                </dd>
                <dt className="text-sm text-zinc-400">
                  {COVERAGE_LABELS[key] ?? key}
                </dt>
              </div>
            ))}
          </dl>
        )}

        <a
          href={buildCheckoutUrl()}
          className={
            'block text-center bg-amber-500 hover:bg-amber-400 ' +
            'text-black font-semibold rounded-lg transition-colors h-12 text-lg ' +
            'focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ' +
            'focus:ring-offset-zinc-950 leading-[3rem]'
          }
        >
          Get Your {productName} — {priceDisplay}
        </a>
      </div>
    );
  }

  /* Waitlisted state */
  if (componentState === 'waitlisted') {
    return (
      <div
        ref={resultRef}
        tabIndex={-1}
        role="status"
        className="bg-amber-950/20 border border-amber-800 rounded-lg p-8 text-center"
      >
        <h3 className="text-xl font-display font-bold text-amber-400 mb-3">
          You are on the list
        </h3>
        <p className="text-zinc-300 text-sm max-w-md mx-auto">
          We will email you at{' '}
          <span className="font-semibold text-white">{email}</span> as soon as
          we have enough data to generate your {productName}. No charge until
          then.
        </p>
      </div>
    );
  }

  /* Error state */
  if (componentState === 'error') {
    return (
      <div
        ref={errorRef}
        tabIndex={-1}
        role="alert"
        aria-live="polite"
        className="bg-red-950/40 border border-red-800 rounded-lg p-6"
      >
        <p className="text-red-300 text-sm mb-4">{errorMsg}</p>
        <button type="button" onClick={handleRetry} className={primaryBtnClass}>
          Try Again
        </button>
      </div>
    );
  }

  /* Unavailable state */
  if (componentState === 'unavailable') {
    return (
      <div
        ref={resultRef}
        tabIndex={-1}
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-8"
      >
        <h3 className="text-xl font-display font-bold text-zinc-200 mb-2">
          Not enough data yet
        </h3>
        <p className="text-zinc-400 text-sm mb-6">
          We do not have enough records to generate a reliable {productName} for
          this search yet. Enter your email and we will notify you as soon as we
          do — no charge until then.
        </p>

        <form onSubmit={handleWaitlist} className="space-y-4">
          <div>
            <label htmlFor={`${id}-waitlist-email`} className={labelClass}>
              Email address{' '}
              <span className="text-red-400" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id={`${id}-waitlist-email`}
              type="email"
              required
              aria-required="true"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className={inputClass}
            />
          </div>

          <button type="submit" className={primaryBtnClass}>
            Notify Me When Available
          </button>
        </form>
      </div>
    );
  }

  /* Idle + Checking states (form) */
  const isChecking = componentState === 'checking';
  const needsName =
    slug === 'judge-report-card' || slug === 'officer-background-check';
  const nameLabel =
    slug === 'judge-report-card' ? 'Judge name' : 'Officer name';
  const namePlaceholder =
    slug === 'judge-report-card'
      ? 'e.g., Sarah Johnson'
      : 'e.g., Michael Rivera';

  return (
    <form
      onSubmit={handleCheck}
      aria-label={`Check ${productName} availability`}
      aria-busy={isChecking}
      className="space-y-5"
    >
      {/* Name input (judge / officer) */}
      {needsName && (
        <div>
          <label htmlFor={`${id}-name`} className={labelClass}>
            {nameLabel}{' '}
            <span className="text-red-400" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id={`${id}-name`}
            ref={firstInputRef as React.RefObject<HTMLInputElement>}
            type="text"
            required
            aria-required="true"
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={namePlaceholder}
            className={inputClass}
            disabled={isChecking}
          />
        </div>
      )}

      {/* Charge type select (similar-cases-analyzer) */}
      {slug === 'similar-cases-analyzer' && (
        <div>
          <label htmlFor={`${id}-charge`} className={labelClass}>
            Charge type{' '}
            <span className="text-red-400" aria-hidden="true">
              *
            </span>
          </label>
          <select
            id={`${id}-charge`}
            ref={firstInputRef as React.RefObject<HTMLSelectElement>}
            required
            aria-required="true"
            value={chargeType}
            onChange={(e) => setChargeType(e.target.value)}
            className={inputClass}
            disabled={isChecking}
          >
            <option value="">Select charge type</option>
            {CHARGE_TYPES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* State select */}
      <div>
        <label htmlFor={`${id}-state`} className={labelClass}>
          State{' '}
          <span className="text-red-400" aria-hidden="true">
            *
          </span>
        </label>
        <select
          id={`${id}-state`}
          required
          aria-required="true"
          value={state}
          onChange={(e) => setState(e.target.value)}
          className={inputClass}
          disabled={isChecking}
        >
          <option value="">Select your state</option>
          {US_STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Submit */}
      <button type="submit" disabled={isChecking} className={primaryBtnClass}>
        {isChecking ? (
          <span className="inline-flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Checking...
          </span>
        ) : (
          'Check Availability'
        )}
      </button>
    </form>
  );
}
