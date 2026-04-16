/**
 * privacy/page.tsx -- Privacy Policy page.
 *
 * Comprehensive Privacy Policy covering: information collected, how info is
 * used, data processing disclosure (Anthropic), discovery document handling,
 * third-party services, data retention (specific periods), user rights and
 * CCPA compliance, cookies, security, children's privacy, data breach
 * notification, international data transfers, changes to policy, and contact.
 *
 * SEO: Static metadata with canonical URL at /privacy.
 */
import type { Metadata } from "next";
import { SITE_URL, CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for ImNotAnAttorney, how we collect, use, and protect your data.",
  alternates: {
    canonical: `${SITE_URL}/privacy`,
  },
};

export default function PrivacyPage() {
  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-white md:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Last updated: April 6, 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-400">
          {/* Human intro, TL;DR before the legal details */}
          <p className="text-base text-zinc-300">
            You&apos;re sharing sensitive legal information with us. We
            don&apos;t take that lightly. Here&apos;s the short version: we
            never see your credit card number, we don&apos;t sell your data,
            your case documents are deleted within 90 days of report delivery,
            and we minimize tracking to essential analytics. Everything below explains
            this in detail.
          </p>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              1. Information We Collect
            </h2>
            <p>We collect the following categories of information:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Contact information:</strong>{" "}
                Name, email address, and phone number (when you submit the
                intake form, purchase a service, or subscribe to our email list)
              </li>
              <li>
                <strong className="text-zinc-300">Case information:</strong>{" "}
                Charge type, state, county, attorney status, discovery status,
                and situation description (when you submit the intake form or
                use our Case Progress Score tool). Also includes
                service-related details provided at checkout: court date (if
                provided), priority delivery selection, and applicable upgrade
                credits
              </li>
              <li>
                <strong className="text-zinc-300">Discovery documents:</strong>{" "}
                Files you upload for case analysis, which may include police
                reports, forensic reports, witness statements, lab results, and
                other legal documents (for $2,497+ service tiers only)
              </li>
              <li>
                <strong className="text-zinc-300">Payment information:</strong>{" "}
                Processed securely and exclusively by Stripe. We do not store,
                access, or have visibility into your credit card number, CVV,
                expiration date, or full card details on our servers. We receive
                only a confirmation of payment status and the last four digits
                of your card for identification purposes.
              </li>
              <li>
                <strong className="text-zinc-300">Usage data:</strong> Pages
                visited and general traffic patterns, collected via Vercel
                Analytics using anonymized, cookieless tracking. IP addresses
                are temporarily stored (60-second windows) for rate-limit
                enforcement on sensitive endpoints and are automatically
                discarded
              </li>
              <li>
                <strong className="text-zinc-300">Communications:</strong> Email
                correspondence with our support team related to your order or
                service. Inbound emails sent to our support address are stored
                to ensure we can respond to and track your requests.
              </li>
            </ul>
            <p className="mt-2">
              We do <strong className="text-zinc-300">not</strong> collect
              biometric information (fingerprints, facial recognition,
              voiceprints, or other identifying biological characteristics).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              2. How We Use Your Information
            </h2>
            <p>We use your information for the following purposes:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                To provide the services you purchase (case analysis, report
                generation, question generation)
              </li>
              <li>
                To process your case information through our analysis systems
                for the purpose of generating your report (see Section 3)
              </li>
              <li>
                To communicate with you about your order, deliverables, and
                service status
              </li>
              <li>
                To send transactional emails (payment confirmation, intake
                confirmation, upload receipts, report delivery notifications,
                intake reminders)
              </li>
              <li>
                To send marketing and educational emails if you subscribe to our
                email list (you can unsubscribe at any time)
              </li>
              <li>
                To improve our services, website, and report quality
              </li>
              <li>
                To detect and prevent fraud, abuse, or unauthorized access
              </li>
            </ul>
            <p className="mt-2">
              We do <strong className="text-zinc-300">not</strong> sell, rent,
              or trade your personal information to third parties for their
              marketing purposes. We do not use your case information or
              discovery documents for any purpose other than providing your
              purchased service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              3. Data Processing &amp; Analysis Technology
            </h2>
            <p>
              Our analysis services use automated processing technology to process
              your case information and generate reports. We believe in full
              transparency about how your data is handled:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">
                  Analysis technology provider:
                </strong>{" "}
                We use technology developed by{" "}
                <a
                  href="https://www.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 underline"
                >
                  Anthropic, Inc.
                </a>
                , headquartered in San Francisco, California
              </li>
              <li>
                <strong className="text-zinc-300">What data is sent:</strong>{" "}
                Your case details from the intake form (charge type, state,
                situation description) and, for discovery-tier services, the
                text content extracted from your uploaded documents
              </li>
              <li>
                <strong className="text-zinc-300">
                  Your data is not used for training:
                </strong>{" "}
                Per Anthropic&apos;s commercial API terms, data sent through
                their API is not used to train or improve their systems
              </li>
              <li>
                <strong className="text-zinc-300">Retention by technology provider:</strong>{" "}
                Per Anthropic&apos;s current commercial API terms, they may
                temporarily retain API inputs and outputs for up to 30 days for
                abuse monitoring and safety purposes, after which they are
                deleted. See{" "}
                <a
                  href="https://www.anthropic.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 underline"
                >
                  Anthropic&apos;s Privacy Policy
                </a>{" "}
                for current details
              </li>
              <li>
                <strong className="text-zinc-300">
                  Case-specific analysis:
                </strong>{" "}
                Your case details (charges, jurisdiction, situation) are
                combined with legal research frameworks to generate analysis
                specific to your matter. This means your personal case
                information directly shapes the analysis output you receive
              </li>
              <li>
                <strong className="text-zinc-300">Our quality review:</strong>{" "}
                Every report is reviewed for quality and compliance before
                delivery. We check for errors, prohibited language, and
                adherence to our information-only standard
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              4. Discovery Document Handling
            </h2>
            <p>
              We understand that discovery documents contain highly sensitive
              legal information. We treat these with the highest level of care:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Storage:</strong> Documents
                are stored in a private, encrypted storage bucket hosted by
                Supabase on AWS infrastructure in the United States (US East
                region)
              </li>
              <li>
                <strong className="text-zinc-300">Access control:</strong>{" "}
                Documents are accessible only through authenticated,
                service-role API access. No public URLs are generated. Each
                upload is tied to a unique case identifier
              </li>
              <li>
                <strong className="text-zinc-300">Purpose limitation:</strong>{" "}
                Documents are used solely for the purpose of generating your
                purchased analysis. They are never shared with third parties
                (other than automated processing as described in Section 3), sold,
                licensed, or used for any other purpose
              </li>
              <li>
                <strong className="text-zinc-300">Automatic deletion:</strong>{" "}
                Discovery documents are automatically deleted 90 days after your
                report is delivered. Consider downloading and saving your
                report upon delivery. You may also request immediate deletion at
                any time by contacting us, documents are removed within 5
                business days of a deletion request.
              </li>
              <li>
                <strong className="text-zinc-300">
                  What happens if you get a refund:
                </strong>{" "}
                If your purchase is <strong className="text-zinc-300">refunded</strong>{" "}
                (delivery guarantee or chargeback), your uploaded documents
                and generated report are deleted, and your report access
                token is revoked. This protects you, once a transaction
                is reversed, we don&apos;t hold onto your data. Satisfaction
                credits do not trigger deletion or token revocation.
              </li>
            </ul>
            <p className="mt-3">
              <strong className="text-zinc-300">Consent.</strong> By
              purchasing our services and submitting case information or
              discovery documents, you consent to the processing of this
              sensitive personal information for the purpose of generating
              your report, including processing through our analysis systems as
              described in Section 3.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              5. Third-Party Services
            </h2>
            <p>
              We use the following third-party services to operate. Each
              processes only the minimum data necessary for its function:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Stripe</strong>, Payment
                processing. Receives your payment card details directly (we
                never see them). Subject to{" "}
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 underline"
                >
                  Stripe&apos;s Privacy Policy
                </a>
              </li>
              <li>
                <strong className="text-zinc-300">Supabase</strong>, Database
                and file storage (US East region). Stores your case data and
                uploaded documents. SOC 2 Type II compliant infrastructure
              </li>
              <li>
                <strong className="text-zinc-300">Anthropic</strong>, Case
                information processing for report generation (see Section 3 for
                details)
              </li>
              <li>
                <strong className="text-zinc-300">Resend</strong>,
                Transactional and marketing email delivery. Receives your email
                address and email content
              </li>
              <li>
                <strong className="text-zinc-300">Vercel</strong>, Website
                hosting, serverless functions, and anonymized analytics
                (cookieless)
              </li>
              <li>
                <strong className="text-zinc-300">Cloudflare</strong>, DNS and
                CDN services. May process your IP address for routing purposes
              </li>
              <li>
                <strong className="text-zinc-300">Google Analytics</strong>,
                Website traffic analytics via Google Analytics 4 (GA4). Collects
                page views, device information (browser, operating system,
                screen size), referral source, and user interaction events
                (clicks, scroll depth, form submissions). IP addresses are
                anonymized by default before storage. Data is retained for
                14 months, after which event-level data is automatically
                deleted while aggregated reports are preserved. Sets{" "}
                <code className="text-zinc-300">_ga</code> and{" "}
                <code className="text-zinc-300">_ga_*</code> cookies to
                distinguish users and sessions. Subject to{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 underline"
                >
                  Google&apos;s Privacy Policy
                </a>
              </li>
              <li>
                <strong className="text-zinc-300">Meta Pixel (consent-gated)</strong>,
                Conversion tracking and ad measurement for Meta (Facebook,
                Instagram) advertising. Tracks page views and conversion
                events (purchases, intake submissions). Sets the{" "}
                <code className="text-zinc-300">_fbp</code> cookie. Data is
                shared with Meta for ad targeting and measurement. The Meta
                Pixel only loads after you provide explicit consent, it is
                disabled by default. Subject to{" "}
                <a
                  href="https://www.facebook.com/privacy/policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 underline"
                >
                  Meta&apos;s Privacy Policy
                </a>
              </li>
              <li>
                <strong className="text-zinc-300">Google Ads (consent-gated)</strong>,
                Conversion tracking and ad measurement for Google Ads
                campaigns. Tracks conversion events for ad attribution. Sets
                the <code className="text-zinc-300">_gcl_au</code> cookie.
                Data is shared with Google for ad measurement and conversion
                reporting. Google Ads only loads after you provide explicit
                consent, it is disabled by default. Subject to{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 underline"
                >
                  Google&apos;s Privacy Policy
                </a>
              </li>
            </ul>
            <p className="mt-2">
              All third-party service providers are based in the United States.
              We do not transfer your data outside the United States.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              6. Data Retention
            </h2>
            <p>
              We retain your data for the following specific periods:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Contact information</strong>{" "}
                (email, name, phone): Retained for 3 years after your last
                interaction with our services, or until you request deletion
              </li>
              <li>
                <strong className="text-zinc-300">Order records:</strong>{" "}
                Retained for 7 years for accounting, tax, and legal compliance
                purposes
              </li>
              <li>
                <strong className="text-zinc-300">Case data</strong> (intake
                responses, generated reports): Retained for 12 months after
                report delivery to support the report access period and upgrade
                credit window. After 12 months, case data is deleted unless you
                have an active higher-tier service
              </li>
              <li>
                <strong className="text-zinc-300">Discovery documents:</strong>{" "}
                Deleted within 90 days after report delivery, or immediately
                upon request (see Section 4)
              </li>
              <li>
                <strong className="text-zinc-300">Report access tokens:</strong>{" "}
                Expire 12 months after report delivery
              </li>
              <li>
                <strong className="text-zinc-300">
                  Email subscriber data:
                </strong>{" "}
                Retained until you unsubscribe. Unsubscribed records are marked
                inactive and purged after 90 days
              </li>
              <li>
                <strong className="text-zinc-300">
                  Drip email send logs:
                </strong>{" "}
                Purged automatically after 90 days
              </li>
              <li>
                <strong className="text-zinc-300">
                  Inbound email correspondence:
                </strong>{" "}
                Retained for 24 months or until you request deletion
              </li>
              <li>
                <strong className="text-zinc-300">
                  Free tool submissions (Case Progress Score):
                </strong>{" "}
                Processed server-side and returned immediately. We do not store
                score inputs permanently.
              </li>
              <li>
                <strong className="text-zinc-300">Usage analytics:</strong>{" "}
                Anonymized and aggregated; no individual-level data is retained
              </li>
              <li>
                <strong className="text-zinc-300">Backup copies:</strong>{" "}
                Our database provider maintains automated backups for disaster
                recovery. Deleted data may persist in encrypted backups for up
                to 30 days after deletion from live systems.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              7. Your Rights
            </h2>
            <p>Regardless of where you live, you have the right to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Access</strong>, Request a
                copy of the personal data we hold about you
              </li>
              <li>
                <strong className="text-zinc-300">Correct</strong>, Request
                correction of inaccurate personal data
              </li>
              <li>
                <strong className="text-zinc-300">Delete</strong>, Request
                deletion of your personal data (subject to legal retention
                requirements for order records)
              </li>
              <li>
                <strong className="text-zinc-300">Unsubscribe</strong>, Opt
                out of marketing emails at any time via the unsubscribe link
                included in every marketing email
              </li>
              <li>
                <strong className="text-zinc-300">Data portability</strong>,
                Request your data in a commonly used, machine-readable format
              </li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, email us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-amber-400 underline"
              >
                {CONTACT_EMAIL}
              </a>
              . We will respond to all requests within 30 days.
            </p>

            <h3 className="mb-2 mt-4 text-base font-semibold text-white">
              California Residents (CCPA/CPRA)
            </h3>
            <p>
              If you are a California resident, you have additional rights under
              the California Consumer Privacy Act (CCPA) as amended by the
              California Privacy Rights Act (CPRA):
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Right to know:</strong> You
                may request that we disclose the categories and specific pieces
                of personal information we have collected about you, the
                categories of sources, the business purpose for collecting it,
                and the categories of third parties with whom we share it
              </li>
              <li>
                <strong className="text-zinc-300">Right to delete:</strong> You
                may request deletion of your personal information, subject to
                certain exceptions (e.g., completing a transaction, legal
                obligations)
              </li>
              <li>
                <strong className="text-zinc-300">Right to opt out:</strong> We
                do not sell or share your personal information as defined by
                the CCPA/CPRA. We do not use your personal information for
                cross-context behavioral advertising
              </li>
              <li>
                <strong className="text-zinc-300">
                  Right to non-discrimination:
                </strong>{" "}
                We will not discriminate against you for exercising your CCPA
                rights
              </li>
              <li>
                <strong className="text-zinc-300">
                  Right to correct:
                </strong>{" "}
                You may request correction of inaccurate personal information
              </li>
              <li>
                <strong className="text-zinc-300">
                  Right to limit use of sensitive data:
                </strong>{" "}
                Case information and discovery documents may constitute
                sensitive personal information. We use this data only for the
                purpose of providing your purchased service, which is a
                permitted use under the CPRA
              </li>
            </ul>
            <p className="mt-2">
              <strong className="text-zinc-300">
                Categories of personal information collected (last 12 months):
              </strong>{" "}
              Identifiers (name, email, phone); commercial information (purchase
              history); internet activity (page views via anonymized analytics);
              sensitive personal information (case details, legal documents).
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">
                Categories disclosed to third parties:
              </strong>{" "}
              Identifiers (to Stripe for payment, to Resend for email delivery);
              case information (to Anthropic for case analysis processing); internet/network
              activity (to Google Analytics for traffic analytics). No categories
              are sold.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">
                Financial incentives.
              </strong>{" "}
              Upgrade credits and satisfaction guarantees are service benefits
              available to all customers. They are not financial incentives
              offered in exchange for providing personal data.
            </p>
            <p className="mt-2">
              To submit a CCPA request, email{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-amber-400 underline"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              with the subject line &quot;CCPA Request.&quot; We will verify your
              identity before processing any request.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">Authorized agents.</strong>{" "}
              You may designate an authorized agent to submit CCPA requests
              on your behalf. Agents must provide written authorization
              signed by you and proof of their identity. We may contact you
              directly to confirm the request.
            </p>

            <h3 className="mb-2 mt-4 text-base font-semibold text-white">
              Other State Privacy Laws
            </h3>
            <p>
              If you reside in a state with comprehensive consumer privacy
              legislation (including but not limited to Virginia, Colorado,
              Connecticut, Utah, Montana, Iowa, Delaware, New Hampshire, New
              Jersey, Nebraska, Tennessee, Minnesota, Maryland, Indiana,
              Kentucky, Rhode Island, Texas, and Oregon), you may have
              similar rights to access, correct, delete, and port your
              personal data, as well as the right to opt out of certain
              processing activities. We do not sell personal data or use it
              for targeted advertising. To exercise any state privacy right,
              email{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-amber-400 underline"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              with the subject line &quot;State Privacy Request&quot; and
              your state of residence. We will respond within the timeframe
              required by your state&apos;s law.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">Appeals.</strong> If we deny
              a request to access, correct, delete, or port your personal
              data, we will provide a written explanation. You may appeal by
              emailing{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-amber-400 underline"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              with the subject line &quot;Privacy Appeal.&quot; We will
              respond to appeals within 60 days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              8. Cookies
            </h2>
            <p>
              We use Google Analytics 4 (GA4), which sets{" "}
              <code className="text-zinc-300">_ga</code> and{" "}
              <code className="text-zinc-300">_ga_*</code> cookies to
              distinguish unique users and track sessions. These cookies expire
              after 2 years and 24 hours respectively. Vercel Analytics provides
              additional anonymized usage data without cookies. Stripe may set
              essential cookies during the checkout
              process to prevent fraud and process payments, see{" "}
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 underline"
              >
                Stripe&apos;s Privacy Policy
              </a>{" "}
              for details. With your explicit consent, we may also load the
              Meta Pixel (which sets the{" "}
              <code className="text-zinc-300">_fbp</code> cookie for
              conversion tracking on Facebook and Instagram ads) and Google
              Ads conversion tracking (which sets the{" "}
              <code className="text-zinc-300">_gcl_au</code> cookie for
              attribution of Google Ads campaigns). Both are disabled by
              default and only activate after you opt in. We do not use
              cookies for cross-site behavioral retargeting outside these
              consent-gated conversion measurement tools. We do not respond to
              Global Privacy Control (GPC) or &quot;Do Not Track&quot; (DNT)
              browser signals because consent for advertising cookies is
              handled through our explicit opt-in flow rather than browser
              signals.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              9. Security
            </h2>
            <p>
              We implement appropriate technical and organizational measures to
              protect your personal data, including:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                HTTPS/TLS encryption for all data in transit (enforced via HSTS)
              </li>
              <li>
                Private, encrypted storage buckets for discovery documents
              </li>
              <li>
                Row-level security policies on all database tables
              </li>
              <li>
                Service-role key access restricted to server-side API routes
                (never exposed to the browser)
              </li>
              <li>
                HMAC-signed, time-limited tokens for operator and report access
                links
              </li>
              <li>
                Rate limiting on all sensitive endpoints (checkout, intake,
                subscription)
              </li>
              <li>
                Security headers (X-Content-Type-Options, X-Frame-Options,
                Referrer-Policy)
              </li>
              <li>
                Input sanitization to prevent XSS and HTML injection in all
                email templates and user-facing outputs
              </li>
            </ul>
            <p className="mt-2">
              No internet service can guarantee zero risk, but we&apos;ve made
              every architectural decision with your case data&apos;s
              sensitivity in mind.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              10. Data Breach Notification
            </h2>
            <p>
              In the event of a data breach that affects your personal
              information, we will notify affected users by email within 72
              hours of becoming aware of the breach. We will also notify
              applicable regulatory authorities as required by law. The
              notification will include: the nature of the breach, the
              categories of data affected, the likely consequences, and the
              measures we are taking to address the breach and mitigate its
              effects.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              11. International Data Transfers
            </h2>
            <p>
              All data processing and storage occurs in the United States. Our
              servers (Supabase, Vercel) are located in US data centers.
              Analysis processing by Anthropic also occurs in the United States. If you access
              our services from outside the United States, you consent to the
              transfer of your data to the United States, which may have
              different data protection laws than your country of residence.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              12. Children&apos;s Privacy
            </h2>
            <p>
              Our services are not intended for individuals under 18 years of
              age. We do not knowingly collect personal information from minors.
              If we learn that we have collected personal information from a
              person under 18, we will delete that information promptly. If you
              believe a minor has provided us with personal information, please
              contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-amber-400 underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              13. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Material
              changes will be posted on this page with an updated &quot;Last
              updated&quot; date. If you have an active order, we will notify
              you of material changes by email. Continued use of our services
              after changes are posted constitutes your acceptance of the
              updated policy. We encourage you to review this page periodically.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              14. Contact
            </h2>
            <p>
              For privacy-related questions, data requests, or to exercise any
              of your rights described above, contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-amber-400 underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
            <p className="mt-2">
              ImNotAnAttorney LLC
              <br />
              195 Dr MLK Jr St N
              <br />
              St Petersburg, FL 33701
            </p>
          </section>
        </div>

      </div>
    </div>
  );
}
