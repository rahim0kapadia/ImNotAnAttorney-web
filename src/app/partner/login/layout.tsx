import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partner Login",
  description: "Log in to your ImNotAnAttorney partner dashboard. Manage referrals, track commissions, and access compliance tools.",
};

export default function PartnerLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
