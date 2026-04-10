'use client';

import { useEffect, useRef, useState } from 'react';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
] as const;

const CHARGE_TYPES = [
  'DUI / DWI', 'Drug Possession', 'Drug Trafficking', 'Assault / Battery',
  'Theft / Burglary', 'Domestic Violence', 'White Collar / Fraud',
  'Sex Offense', 'Federal Criminal', 'Probation Violation',
  'Weapons Charge', 'Juvenile', 'Other',
] as const;

type FormState = 'idle' | 'submitting' | 'success' | 'error';
type FieldErrors = Record<string, string>;

const INPUT_CLASS =
  'mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-white placeholder-zinc-400 ' +
  'focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900';

const INPUT_ERROR_CLASS =
  'mt-1 w-full rounded-lg border border-red-500 bg-zinc-800/50 px-4 py-2.5 text-white placeholder-zinc-400 ' +
  'focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-zinc-900';

const LABEL_CLASS = 'block text-sm font-medium text-zinc-200';

function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="text-red-400"> *</span>
      <span className="sr-only"> required</span>
    </>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-400">
      {message}
    </p>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateFields(data: FormData): FieldErrors {
  const errors: FieldErrors = {};
  const firstName = (data.get('firstName') as string)?.trim();
  const lastName = (data.get('lastName') as string)?.trim();
  const email = (data.get('email') as string)?.trim();
  const state = data.get('state') as string;
  const chargeType = data.get('chargeType') as string;
  const situation = (data.get('situation') as string)?.trim();

  if (!firstName) errors.firstName = 'First name is required';
  if (!lastName) errors.lastName = 'Last name is required';
  if (!email) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
  if (!state) errors.state = 'State is required';
  if (!chargeType) errors.chargeType = 'Charge type is required';
  if (!situation) errors.situation = 'Please describe your situation';
  else if (situation.length > 5000) errors.situation = 'Must be under 5,000 characters';

  const hasPD = data.get('hasPublicDefender') === 'on';
  const belowPov = data.get('belowPovertyLevel') === 'on';
  const incFam = data.get('incarceratedFamily') === 'on';
  if (!hasPD && !belowPov && !incFam) {
    errors.qualifiers = 'Select at least one qualifying condition';
  }

  return errors;
}

export function IddApplicationForm() {
  const [formState, setFormState] = useState<FormState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (formState === 'success') {
      successHeadingRef.current?.focus();
    } else if (formState === 'error' && !Object.keys(fieldErrors).length) {
      errorRef.current?.focus();
    }
  }, [formState, fieldErrors]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage('');

    const form = e.currentTarget;
    const data = new FormData(form);

    // Client-side validation
    const errors = validateFields(data);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      // Focus the first invalid field
      const firstErrorField = Object.keys(errors)[0];
      const el = form.querySelector<HTMLElement>(`[name="${firstErrorField}"], #${firstErrorField}`);
      el?.focus();
      return;
    }

    setFormState('submitting');

    const payload = {
      firstName: data.get('firstName'),
      lastName: data.get('lastName'),
      email: data.get('email'),
      phone: data.get('phone'),
      state: data.get('state'),
      chargeType: data.get('chargeType'),
      situation: data.get('situation'),
      hasPublicDefender: data.get('hasPublicDefender') === 'on',
      belowPovertyLevel: data.get('belowPovertyLevel') === 'on',
      incarceratedFamily: data.get('incarceratedFamily') === 'on',
    };

    try {
      const res = await fetch('/api/idd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Submission failed');
      }

      setFormState('success');
    } catch (err) {
      setFormState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  if (formState === 'success') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-8 text-center"
      >
        <h2
          ref={successHeadingRef}
          tabIndex={-1}
          className="text-xl font-semibold text-emerald-400 focus:outline-none"
        >
          Application Received
        </h2>
        <p className="mt-3 text-zinc-200">
          We review applications within 48 hours. You&apos;ll receive an email
          with your application status.
        </p>
      </div>
    );
  }

  const hasErrors = Object.keys(fieldErrors).length > 0;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6" aria-busy={formState === 'submitting'} noValidate>
      <p className="sr-only">Required fields are marked with an asterisk.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className={LABEL_CLASS}>
            First Name<RequiredMark />
          </label>
          <input id="firstName" name="firstName" type="text" required autoComplete="given-name"
            aria-invalid={!!fieldErrors.firstName} aria-describedby={fieldErrors.firstName ? 'firstName-error' : undefined}
            className={fieldErrors.firstName ? INPUT_ERROR_CLASS : INPUT_CLASS} />
          <FieldError id="firstName-error" message={fieldErrors.firstName} />
        </div>
        <div>
          <label htmlFor="lastName" className={LABEL_CLASS}>
            Last Name<RequiredMark />
          </label>
          <input id="lastName" name="lastName" type="text" required autoComplete="family-name"
            aria-invalid={!!fieldErrors.lastName} aria-describedby={fieldErrors.lastName ? 'lastName-error' : undefined}
            className={fieldErrors.lastName ? INPUT_ERROR_CLASS : INPUT_CLASS} />
          <FieldError id="lastName-error" message={fieldErrors.lastName} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className={LABEL_CLASS}>
            Email<RequiredMark />
          </label>
          <input id="email" name="email" type="email" required autoComplete="email"
            aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            className={fieldErrors.email ? INPUT_ERROR_CLASS : INPUT_CLASS} />
          <FieldError id="email-error" message={fieldErrors.email} />
        </div>
        <div>
          <label htmlFor="phone" className={LABEL_CLASS}>Phone</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="(555) 123-4567" className={INPUT_CLASS} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="state" className={LABEL_CLASS}>
            State<RequiredMark />
          </label>
          <select id="state" name="state" required autoComplete="address-level1"
            aria-invalid={!!fieldErrors.state} aria-describedby={fieldErrors.state ? 'state-error' : undefined}
            className={fieldErrors.state ? INPUT_ERROR_CLASS : INPUT_CLASS}>
            <option value="">Select state</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <FieldError id="state-error" message={fieldErrors.state} />
        </div>
        <div>
          <label htmlFor="chargeType" className={LABEL_CLASS}>
            Charge Type<RequiredMark />
          </label>
          <select id="chargeType" name="chargeType" required
            aria-invalid={!!fieldErrors.chargeType} aria-describedby={fieldErrors.chargeType ? 'chargeType-error' : undefined}
            className={fieldErrors.chargeType ? INPUT_ERROR_CLASS : INPUT_CLASS}>
            <option value="">Select charge type</option>
            {CHARGE_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <FieldError id="chargeType-error" message={fieldErrors.chargeType} />
        </div>
      </div>

      <fieldset className="rounded-xl border border-zinc-700/50 p-5"
        aria-invalid={!!fieldErrors.qualifiers} aria-describedby={fieldErrors.qualifiers ? 'qualifiers-error' : undefined}>
        <legend className="px-2 text-sm font-medium text-zinc-200">
          Qualifying Conditions <span className="text-zinc-400">(check all that apply)</span>
        </legend>
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-3">
            <input id="hasPublicDefender" type="checkbox" name="hasPublicDefender"
              className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900" />
            <label htmlFor="hasPublicDefender" className="cursor-pointer text-zinc-200">
              I am currently represented by a public defender or court-appointed attorney
            </label>
          </div>

          <div className="flex items-start gap-3">
            <input id="belowPovertyLevel" type="checkbox" name="belowPovertyLevel"
              className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900" />
            <div className="flex-1">
              <label htmlFor="belowPovertyLevel" className="cursor-pointer text-zinc-200">
                My household income is below 200% of the Federal Poverty Level
              </label>
              <a href="https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines"
                target="_blank" rel="noopener noreferrer"
                className="mt-1 block text-sm text-amber-400 underline hover:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900 rounded">
                Check federal poverty guidelines
                <span className="sr-only"> (opens in new tab)</span>
                <span aria-hidden="true"> &#8599;</span>
              </a>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <input id="incarceratedFamily" type="checkbox" name="incarceratedFamily"
              className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900" />
            <label htmlFor="incarceratedFamily" className="cursor-pointer text-zinc-200">
              I am applying on behalf of an incarcerated family member
            </label>
          </div>
        </div>
        <FieldError id="qualifiers-error" message={fieldErrors.qualifiers} />
      </fieldset>

      <div>
        <label htmlFor="situation" className={LABEL_CLASS}>
          Tell us about your situation<RequiredMark />
        </label>
        <p id="situation-help" className="mt-1 text-xs text-zinc-400">
          A sentence or two is enough. Do not include names of co-defendants or sensitive details.
        </p>
        <textarea id="situation" name="situation" required rows={4}
          aria-invalid={!!fieldErrors.situation}
          aria-describedby={[fieldErrors.situation ? 'situation-error' : null, 'situation-help'].filter(Boolean).join(' ')}
          placeholder="Brief description of your charges and situation..."
          className={fieldErrors.situation ? INPUT_ERROR_CLASS : INPUT_CLASS} />
        <FieldError id="situation-error" message={fieldErrors.situation} />
      </div>

      {hasErrors && (
        <div role="alert" aria-live="assertive" className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          <span className="font-semibold">Please fix the errors above</span> before submitting.
        </div>
      )}

      <div ref={errorRef} role="alert" aria-live="assertive" tabIndex={-1} className="focus:outline-none">
        {formState === 'error' && errorMessage && (
          <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">
            <span className="font-semibold">Error:</span> {errorMessage}
          </p>
        )}
      </div>

      <button type="submit" disabled={formState === 'submitting'} aria-disabled={formState === 'submitting'}
        className="w-full rounded-lg bg-amber-500 px-6 py-3 font-semibold text-black transition hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed">
        {formState === 'submitting' ? 'Submitting...' : 'Apply for Scholarship'}
      </button>
    </form>
  );
}
