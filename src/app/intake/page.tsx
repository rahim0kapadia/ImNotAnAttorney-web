"use client";

import { useState } from "react";

const chargeTypes = [
  "Drug Possession",
  "Drug Trafficking",
  "DUI / DWI",
  "White Collar / Fraud",
  "Federal Charges",
  "Other",
];

const serviceInterests = [
  "Question Pack",
  "Discovery Review",
  "Motion Awareness Report",
  "Full Case Package",
  "Not sure — help me decide",
];

export default function IntakePage() {
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    // Collect checkboxes separately
    const services = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="services"]:checked')).map(el => el.value);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, services }),
      });
      if (res.ok) setSubmitted(true);
    } catch {
      // silently fail for now, form still shows
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-3xl">
            ✓
          </div>
          <h1 className="text-2xl font-bold text-white">We got it.</h1>
          <p className="mt-3 text-zinc-400">
            We&apos;ll review your information and get back to you within 24
            hours. Check your email.
          </p>
          <p className="mt-6 text-sm text-zinc-500">
            In the meantime, read our{" "}
            <a href="/blog" className="text-amber-400 hover:underline">
              blog
            </a>{" "}
            — it&apos;s full of free information about your rights.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-white md:text-4xl">
          Tell us about your case
        </h1>
        <p className="mt-3 text-zinc-400">
          Everything you share is confidential. We&apos;ll use this to determine
          which services fit your situation and give you an accurate quote.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-8">
          {/* Contact Info */}
          <fieldset>
            <legend className="text-sm font-semibold text-zinc-300">
              Contact Information
            </legend>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="firstName"
                  className="block text-xs text-zinc-500"
                >
                  First Name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
                  placeholder="First name"
                />
              </div>
              <div>
                <label
                  htmlFor="lastName"
                  className="block text-xs text-zinc-500"
                >
                  Last Name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
                  placeholder="Last name"
                />
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="email" className="block text-xs text-zinc-500">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
                placeholder="you@email.com"
              />
            </div>
            <div className="mt-4">
              <label htmlFor="phone" className="block text-xs text-zinc-500">
                Phone (optional)
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
                placeholder="(555) 555-5555"
              />
            </div>
          </fieldset>

          {/* Case Info */}
          <fieldset>
            <legend className="text-sm font-semibold text-zinc-300">
              Case Information
            </legend>
            <div className="mt-4">
              <label
                htmlFor="chargeType"
                className="block text-xs text-zinc-500"
              >
                Type of Charges
              </label>
              <select
                id="chargeType"
                name="chargeType"
                required
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="">Select charge type</option>
                {chargeTypes.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4">
              <label htmlFor="state" className="block text-xs text-zinc-500">
                State
              </label>
              <input
                id="state"
                name="state"
                type="text"
                required
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
                placeholder="e.g., Florida"
              />
            </div>
            <div className="mt-4">
              <label
                htmlFor="hasAttorney"
                className="block text-xs text-zinc-500"
              >
                Do you have a private attorney?
              </label>
              <select
                id="hasAttorney"
                name="hasAttorney"
                required
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="">Select</option>
                <option value="yes">Yes — private attorney</option>
                <option value="public">Public defender</option>
                <option value="no">No attorney yet</option>
              </select>
            </div>
            <div className="mt-4">
              <label
                htmlFor="hasDiscovery"
                className="block text-xs text-zinc-500"
              >
                Have you received discovery documents?
              </label>
              <select
                id="hasDiscovery"
                name="hasDiscovery"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="unsure">Not sure</option>
              </select>
            </div>
          </fieldset>

          {/* Service Interest */}
          <fieldset>
            <legend className="text-sm font-semibold text-zinc-300">
              What are you interested in?
            </legend>
            <div className="mt-4 space-y-2">
              {serviceInterests.map((svc) => (
                <label
                  key={svc}
                  className="flex items-center gap-3 text-sm text-zinc-400"
                >
                  <input
                    type="checkbox"
                    name="services"
                    value={svc}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
                  />
                  {svc}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Situation */}
          <div>
            <label
              htmlFor="situation"
              className="block text-xs text-zinc-500"
            >
              Tell us more about your situation (optional)
            </label>
            <textarea
              id="situation"
              name="situation"
              rows={4}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
              placeholder="What's going on with your case? What's frustrating you? The more we know, the better we can help."
            />
          </div>

          {/* Disclaimer */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs text-zinc-500">
              By submitting this form, you understand that ImNotAnAttorney
              provides legal information and research — not legal advice. We are
              not a law firm and do not create an attorney-client relationship.
              Your information is kept confidential.
            </p>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-amber-500 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            Submit — Get Your Case Reviewed
          </button>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-600">
            <span>🔒 Your information is confidential</span>
            <span>⚡ Response within 24 hours</span>
            <span>🛡️ Deliverable guarantee</span>
          </div>
        </form>
      </div>
    </div>
  );
}
