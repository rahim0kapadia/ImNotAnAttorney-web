import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Case Intake",
  description:
    "Start your case review. Tell us about your charges, your attorney, and your discovery — and we'll give you the questions that matter.",
};

export default function IntakeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
