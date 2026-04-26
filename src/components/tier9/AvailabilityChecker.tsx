'use client';

/**
 * AvailabilityChecker, pre-purchase data availability gate for Tier 9 standalone SKUs.
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

const CHARGE_GROUPS = [
  {
    label: 'DUI & Driving Offenses',
    options: [
      { value: 'dui', label: 'DUI / DWI' },
      { value: 'dui-first', label: 'DUI, First Offense' },
      { value: 'dui-repeat', label: 'DUI, Repeat Offense' },
      { value: 'hit-and-run', label: 'Hit and Run / Fleeing' },
    ],
  },
  {
    label: 'Drug Offenses',
    options: [
      { value: 'drug-possession', label: 'Drug Possession' },
      { value: 'drug-trafficking', label: 'Drug Trafficking' },
    ],
  },
  {
    label: 'Violent Crimes',
    options: [
      { value: 'assault', label: 'Assault' },
      { value: 'domestic-violence', label: 'Domestic Violence' },
      { value: 'murder', label: 'Murder / Attempted Murder' },
      { value: 'manslaughter', label: 'Manslaughter / Vehicular Homicide' },
      { value: 'kidnapping', label: 'Kidnapping / Human Trafficking' },
      { value: 'robbery', label: 'Robbery' },
      { value: 'stalking', label: 'Stalking / Harassment' },
      { value: 'child-abuse', label: 'Child Abuse / Endangerment' },
    ],
  },
  {
    label: 'Property Crimes',
    options: [
      { value: 'theft', label: 'Theft / Larceny' },
      { value: 'burglary', label: 'Burglary / Breaking and Entering' },
      { value: 'arson', label: 'Arson' },
    ],
  },
  {
    label: 'Sex Offenses',
    options: [
      { value: 'sex-offense', label: 'Sex Offense' },
      { value: 'sex-offense-contact', label: 'Sex Offense, Contact' },
      { value: 'sex-offense-digital', label: 'Sex Offense, Digital / Possession' },
    ],
  },
  {
    label: 'Financial Crimes',
    options: [
      { value: 'white-collar', label: 'White Collar / Financial Crime' },
      { value: 'fraud', label: 'Fraud / Identity Theft' },
    ],
  },
  {
    label: 'Other Charges',
    options: [
      { value: 'weapons', label: 'Weapons Charge' },
      { value: 'federal', label: 'Federal Charge' },
      { value: 'probation-violation', label: 'Probation Violation' },
      { value: 'self-defense', label: 'Self-Defense Claim' },
      { value: 'contempt', label: 'Contempt / Obstruction' },
      { value: 'other', label: 'Other' },
    ],
  },
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
  judges: 'federal judges in database',
  benchmarks: 'outcome benchmark records',
  agencies: 'agencies with incident data',
  cpdOfficers: 'Chicago PD officer records (FOIA)',
  cpdComplaints: 'Chicago PD misconduct complaints',
  nypdOfficers: 'NYPD officer roster matches (CCRB)',
  nypdAllegations: 'NYPD CCRB allegations on the matched officer',
  // similar-cases-analyzer state-coverage gating (D2 plan, 2026-04-26)
  pleaState: 'state plea-discount records',
  pleaFederal: 'federal plea-discount records',
  sentencingState: 'state sentencing records',
  outcomeNational: 'national outcome benchmarks',
  // officer-background-check state-coverage gating (D3 plan, 2026-04-26)
  externalIntelState: 'state-level external-intelligence records',
};

const LOCALSTORAGE_KEY = 'inna_email';

/* ────────────────────────────────────────────────────────── */
/* Types                                                       */
/* ────────────────────────────────────────────────────────── */

type Slug = 'judge-report-card' | 'officer-background-check' | 'similar-cases-analyzer' | 'district-court-intelligence' | 'arrest-survival-kit';

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
  const prevStateRef = useRef<ComponentState>('idle');

  // Pre-fill email from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCALSTORAGE_KEY);
      if (saved) setEmail(saved);
    } catch {
      // localStorage unavailable (SSR, privacy mode)
    }
  }, []);

  // Deterministic focus management on state transitions (no setTimeout race)
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = componentState;

    switch (componentState) {
      case 'available':
      case 'unavailable':
      case 'waitlisted':
        resultRef.current?.focus();
        break;
      case 'error':
        errorRef.current?.focus();
        break;
      case 'idle':
        if (prev === 'error') firstInputRef.current?.focus();
        break;
    }
  }, [componentState]);

  /* ── Availability check ── */

  const handleCheck = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (componentState === 'checking') return;
    setErrorMsg('');
    setComponentState('checking');

    const payload: Record<string, string> = { state };
    if (slug === 'judge-report-card') payload.judgeName = name;
    else if (slug === 'officer-background-check') payload.officerName = name;
    else if (slug === 'similar-cases-analyzer') payload.chargeType = chargeType;
    // arrest-survival-kit: state-only (already in base payload)

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
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setComponentState('error');
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
    else if (slug === 'similar-cases-analyzer') payload.chargeType = chargeType;
    // arrest-survival-kit: state-only (already in base payload)

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
      } else {
        throw new Error('Waitlist registration failed. Please try again.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setComponentState('error');
    }
  }, [slug, name, state, chargeType, email]);

  /* ── Retry from error ── */

  const handleRetry = useCallback(() => {
    setErrorMsg('');
    setComponentState('idle');
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
    /* Similar-cases coverage shape — used for both the pre-purchase banner
       (W2) and the dl filter (W3). When state-level data covers a section,
       the federal/national fallback metric is not consumed by the renderer
       and showing it in the dl grid double-counts inventory. */
    const isSimilarCases = slug === 'similar-cases-analyzer';
    const pleaStateMissing =
      isSimilarCases &&
      (coverage.pleaState ?? 0) === 0 &&
      (coverage.pleaFederal ?? 0) > 0;
    const sentencingStateMissing =
      isSimilarCases &&
      (coverage.sentencingState ?? 0) === 0 &&
      (coverage.outcomeNational ?? 0) > 0;
    const pleaStateCovers =
      isSimilarCases && (coverage.pleaState ?? 0) > 0;
    const sentencingStateCovers =
      isSimilarCases && (coverage.sentencingState ?? 0) > 0;
    const stateLabel =
      US_STATES.find((s) => s.value === state)?.label ?? state;

    /* Officer-background-check thin-state derivation (D3 plan, 2026-04-26).
       Banner fires when external_intel state-coverage is <50 rows AND
       neither CPD (IL) nor NYPD (NY) enrichment is present. CPD/NYPD
       enrichment supersedes the banner so existing IL/NY customers see
       no new disclosures. */
    const isOfficerBgCheck = slug === 'officer-background-check';
    const officerExternalIntelStateCount =
      (coverage.externalIntelState ?? 0) as number;
    const officerNationwideCount = (coverage.officers ?? 0) as number;
    const officerHasCpd = (coverage.cpdComplaints ?? 0) > 0;
    const officerHasNypd = (coverage.nypdOfficers ?? 0) > 0;
    const officerThinState =
      isOfficerBgCheck &&
      officerExternalIntelStateCount < 50 &&
      !officerHasCpd &&
      !officerHasNypd;

    /* Banner copy (W2): branch on which side(s) of the report fall back
       to federal so the customer sees the right disclosure pre-purchase. */
    let fallbackBanner: React.ReactNode = null;
    if (pleaStateMissing && sentencingStateMissing) {
      fallbackBanner = (
        <p className="text-amber-200 text-sm">
          <strong>Heads up:</strong> State-specific plea-discount and
          sentencing-distribution data are not yet available for{' '}
          {stateLabel}. The report will use federal-level data as the closest
          available reference.
        </p>
      );
    } else if (pleaStateMissing) {
      fallbackBanner = (
        <p className="text-amber-200 text-sm">
          <strong>Heads up:</strong> State-specific plea-discount data is not yet
          available for {stateLabel}. The report will use federal-level data as
          the closest available reference.
        </p>
      );
    } else if (sentencingStateMissing) {
      fallbackBanner = (
        <p className="text-amber-200 text-sm">
          <strong>Heads up:</strong> State-specific sentencing-distribution data
          is not yet available for {stateLabel}. Plea-discount data is
          state-specific. The report will use federal-level sentencing data as
          the closest available reference.
        </p>
      );
    } else if (officerThinState) {
      fallbackBanner = (
        <p className="text-amber-200 text-sm">
          <strong>Heads up:</strong> External-intelligence data for {stateLabel}{' '}
          is currently limited ({officerExternalIntelStateCount.toLocaleString()}{' '}
          records). The report will include name-match data from our reliability
          database ({officerNationwideCount.toLocaleString()} records nationwide),
          plus any matching agency-specific records.
        </p>
      );
    }

    /* dl filter (W3): drop fallback-only metrics that this customer's
       path does not actually consume. */
    const entries = Object.entries(coverage).filter(([key, count]) => {
      if (count <= 0) return false;
      if (pleaStateCovers && key === 'pleaFederal') return false;
      if (sentencingStateCovers && key === 'outcomeNational') return false;
      return true;
    });

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

        {/* Similar-cases state-coverage info banner (D2 plan, 2026-04-26;
            extended 2026-04-26 PR #168 review W2). Surfaces federal-fallback
            BEFORE purchase so defendants without ingested state-level
            plea-discount OR sentencing data know the affected sections will
            use federal data. Buy button stays — disclosure, not a hard block. */}
        {fallbackBanner && (
          <div
            className="bg-amber-950/30 border-l-4 border-amber-500 rounded-r-lg p-4 mb-6"
            role="note"
          >
            {fallbackBanner}
          </div>
        )}

        {entries.length > 0 && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-8">
            {entries.map(([key, count]) => (
              <div key={key} className="flex items-baseline gap-2">
                <dt className="text-sm text-zinc-400 order-2">
                  {COVERAGE_LABELS[key] ?? key}
                </dt>
                <dd className="text-2xl font-bold text-amber-500 tabular-nums order-1">
                  {count.toLocaleString()}
                </dd>
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
          Get Your {productName}, {priceDisplay}
        </a>

        <button
          type="button"
          onClick={handleRetry}
          className="w-full text-center text-sm text-zinc-400 hover:text-zinc-200 transition-colors mt-3 h-10 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-950 rounded-lg"
        >
          Check a different {slug === 'similar-cases-analyzer' ? 'charge' : (slug === 'district-court-intelligence' || slug === 'arrest-survival-kit') ? 'state' : 'name'}
        </button>
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

        <button
          type="button"
          onClick={handleRetry}
          className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors mt-4 h-10 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-950 rounded-lg"
        >
          Check a different {slug === 'similar-cases-analyzer' ? 'charge' : (slug === 'district-court-intelligence' || slug === 'arrest-survival-kit') ? 'state' : 'name'}
        </button>
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
        role="status"
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-8"
      >
        <h3 className="text-xl font-display font-bold text-zinc-200 mb-2">
          Not enough data yet
        </h3>
        <p className="text-zinc-400 text-sm mb-6">
          We do not have enough records to generate a reliable {productName} for
          this search yet. Enter your email and we will notify you as soon as we
          do, no charge until then.
        </p>

        <form onSubmit={handleWaitlist} aria-label={`Join waitlist for ${productName}`} className="space-y-4">
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
            {CHARGE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
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
      <button type="submit" aria-disabled={isChecking || undefined} className={primaryBtnClass}>
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

      <div aria-live="polite" className="sr-only">
        {isChecking ? 'Checking availability, please wait...' : ''}
      </div>
    </form>
  );
}
