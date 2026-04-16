import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';
import { IddApplicationForm } from '@/components/idd/IddApplicationForm';
import { ScholarshipCounter } from '@/components/ScholarshipCounter';

export const metadata: Metadata = {
  title: 'IDD Scholarship Program | ImNotAnAttorney',
  description: 'Free defense research for defendants who cannot afford it. Funded by every paying customer. Apply in 2 minutes.',
  openGraph: {
    title: 'IDD Scholarship Program | ImNotAnAttorney',
    description: 'Free defense research for defendants who cannot afford it.',
    url: `${SITE_URL}/idd`,
  },
};

export default function IddPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          IDD Scholarship Program
        </h1>
        <p className="mt-4 text-lg text-zinc-300">
          Indigent Defendant Direct, free defense research for defendants who need it most.
        </p>
      </div>

      <ScholarshipCounter className="mt-8" />

      <section aria-labelledby="how-it-works-heading" className="mt-12 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 id="how-it-works-heading" className="text-lg font-semibold text-white">How it works</h2>
        <ol className="mt-4 space-y-3 text-zinc-200">
          <li className="flex gap-3">
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-sm font-bold text-amber-400">1</span>
            <span>Answer a few qualifying questions below (2 minutes).</span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-sm font-bold text-amber-400">2</span>
            <span>Our team reviews your application within 48 hours.</span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-sm font-bold text-amber-400">3</span>
            <span>If approved, you receive the same research our paying customers get, at no cost.</span>
          </li>
        </ol>
      </section>

      <p className="mt-8 text-center text-sm text-zinc-400">
        Every paying customer funds scholarships. This program runs on cross-subsidy, not donations.
      </p>

      <section aria-labelledby="apply-heading" className="mt-8">
        <h2 id="apply-heading" className="text-lg font-semibold text-white">Apply</h2>
        <p className="mt-1 text-sm text-zinc-400">
          You qualify if any one of the conditions below applies to you.
        </p>
        <div className="mt-6">
          <IddApplicationForm />
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="mt-16 space-y-6">
        <h2 id="faq-heading" className="text-lg font-semibold text-white">Common Questions</h2>
        <div>
          <h3 className="font-medium text-zinc-100">What research will I receive?</h3>
          <p className="mt-1 text-sm text-zinc-300">
            The same standalone research products our paying customers receive. Which specific
            product depends on your charge type and situation.
          </p>
        </div>
        <div>
          <h3 className="font-medium text-zinc-100">How is this funded?</h3>
          <p className="mt-1 text-sm text-zinc-300">
            Every Case Decoder purchase funds 1 scholarship. Every War Room purchase funds 10.
            No donations, no grants, direct cross-subsidy from paying customers.
          </p>
        </div>
        <div>
          <h3 className="font-medium text-zinc-100">How long does it take?</h3>
          <p className="mt-1 text-sm text-zinc-300">
            Applications are reviewed within 48 hours. Once approved, you receive your research
            within the same delivery window as paid products (typically 24-72 hours).
          </p>
        </div>
        <div>
          <h3 className="font-medium text-zinc-100">Is my information private?</h3>
          <p className="mt-1 text-sm text-zinc-300">
            Yes. All case information is handled with the same confidentiality as paid orders.
            We never share individual case details.
          </p>
        </div>
      </section>
    </main>
  );
}
