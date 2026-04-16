import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compliance Report — ImNotAnAttorney Partner",
};

export default function ComplianceReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
