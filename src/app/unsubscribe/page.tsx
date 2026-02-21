import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const success = params.success === "true";
  const error = params.error;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        {success ? (
          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-3xl text-zinc-400">
              &#10003;
            </div>
            <h1 className="text-2xl font-bold text-white">
              You&apos;ve been unsubscribed
            </h1>
            <p className="mt-3 text-zinc-400">
              You won&apos;t receive any more emails from us. If you change your
              mind, you can always re-subscribe on our homepage.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white">
              Unsubscribe
            </h1>
            <p className="mt-3 text-zinc-400">
              {error === "missing" || error === "invalid"
                ? "This unsubscribe link appears to be invalid. Please use the link from your email."
                : "Something went wrong. Please try again or contact us."}
            </p>
          </>
        )}
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg border border-zinc-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-zinc-500"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
