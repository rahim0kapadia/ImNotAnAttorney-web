/**
 * Pattern Jury Instructions sitemap — /pji/sitemap.xml
 *
 * Emits 1 URL per verified PJI row plus the /pji index page.
 * Filters by roundtrip_verified = true to avoid indexing unverified data
 * per no-hallucinated-legal-data rule.
 */
import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400; // daily

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("pattern_jury_instructions")
    .select("circuit, instruction_number, updated_at")
    .eq("roundtrip_verified", true)
    .order("circuit")
    .order("instruction_number");

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/pji`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  for (const r of (data ?? []) as {
    circuit: number;
    instruction_number: string;
    updated_at: string | null;
  }[]) {
    entries.push({
      url: `${SITE_URL}/pji/${r.circuit}/${r.instruction_number}`,
      lastModified: r.updated_at ? new Date(r.updated_at) : new Date(),
      changeFrequency: "yearly",
      priority: 0.6,
    });
  }
  return entries;
}
