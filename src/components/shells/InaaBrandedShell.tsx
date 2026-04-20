import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

interface InaaBrandedShellProps {
  children: ReactNode;
  partnerCode?: string | null;
}

export function InaaBrandedShell({ children, partnerCode }: InaaBrandedShellProps) {
  return (
    <div data-partner-code={partnerCode ?? undefined} className="min-h-screen bg-black text-zinc-100">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
