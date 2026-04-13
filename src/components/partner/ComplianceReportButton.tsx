import Link from "next/link";

export function ComplianceReportButton() {
  return (
    <Link
      href="/partner/compliance-report"
      className="inline-block px-4 py-2 border border-zinc-600 text-zinc-300 rounded-lg text-sm hover:border-amber-500 hover:text-amber-400 transition-colors"
    >
      Download Compliance Report
    </Link>
  );
}
