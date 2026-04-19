import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { createAdminClient } from "@/lib/supabase/admin";

export const alt = "Court prep referred by a partner — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 300;

function truncate(s: string, max = 24): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Z0-9]{2,20}$/i.test(code)) {
    return renderOgImage({
      title: "Court date reminders + hearing prep.",
      subtitle: "Court date reminders and what to expect\nat your hearing.",
      category: "Court Prep",
    });
  }
  let partnerName = "a trusted partner";
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("partners")
      .select("company, name")
      .eq("promo_code", code.toUpperCase())
      .maybeSingle();
    if (data) partnerName = truncate(data.company || data.name);
  } catch {}
  return renderOgImage({
    title: `Court date reminders +\nhearing prep — ${partnerName}`,
    subtitle: "Court date reminders and what to expect\nat your hearing.",
    category: "Court Prep",
  });
}
