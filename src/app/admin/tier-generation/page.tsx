/**
 * Admin UI: /admin/tier-generation
 *
 * Server Component. Fetches rows server-side (via admin client) and
 * renders a table with a client-side dropdown form per row. Flipping
 * a mode re-hits the POST endpoint below.
 *
 * Protected by the standard admin middleware (X-Admin-Password header
 * on the API endpoint). This page itself is rendered behind the admin
 * auth layer per existing /admin/* conventions.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import TierModeForm from "./TierModeForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  tier_slug: string;
  mode: string;
  updated_at: string;
  updated_by: string | null;
  notes: string | null;
};

export default async function TierGenerationPage() {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("tier_generation_config")
    .select("tier_slug, mode, updated_at, updated_by, notes")
    .order("tier_slug");

  if (error) {
    return (
      <main className="p-8">
        <h1 className="text-xl font-bold mb-4">Tier Generation Config</h1>
        <p className="text-red-400">DB error: {error.message}</p>
      </main>
    );
  }

  const rows = (data ?? []) as Row[];

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold mb-2">Tier Generation Config</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Per-tier generation-mode switch. Default <code>api</code> = existing Edge
        Function path. <code>mechanical</code> = HTML skeleton only.{" "}
        <code>hybrid</code> = skeleton + Haiku per slot. <code>session</code> =
        operator generates by hand via pasted prompt.
      </p>
      <table className="w-full border border-neutral-800 text-sm">
        <thead className="bg-neutral-900">
          <tr>
            <th className="text-left p-2 border-b border-neutral-800">Tier</th>
            <th className="text-left p-2 border-b border-neutral-800">Mode</th>
            <th className="text-left p-2 border-b border-neutral-800">Updated</th>
            <th className="text-left p-2 border-b border-neutral-800">By</th>
            <th className="text-left p-2 border-b border-neutral-800">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tier_slug} className="border-b border-neutral-900">
              <td className="p-2 font-mono">{r.tier_slug}</td>
              <td className="p-2">
                <TierModeForm tierSlug={r.tier_slug} currentMode={r.mode} currentNotes={r.notes ?? ""} />
              </td>
              <td className="p-2 text-neutral-400">
                {new Date(r.updated_at).toISOString().replace("T", " ").slice(0, 16)}
              </td>
              <td className="p-2 text-neutral-400">{r.updated_by ?? "—"}</td>
              <td className="p-2 text-neutral-300 truncate max-w-xs">{r.notes ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
