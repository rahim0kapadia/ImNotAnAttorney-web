import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { allStateSlugs, getStateDuiData } from "@/data/state-dui-laws";

export const alt = "DUI Defense by State, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return allStateSlugs().map((state) => ({ state }));
}

export default async function Image({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const data = getStateDuiData(state);
  return renderOgImage({
    title: data ? `${data.name} DUI\nDefense Guide.` : "DUI Defense\nby State.",
    subtitle: data ? `BAC ${data.bac}. Penalties, defenses, and what to do next.` : undefined,
    category: "State Briefing",
  });
}
