import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { allStateDvLawsSlugs, getStateDvLawsData } from "@/data/state-dv-laws";

export const alt = "Domestic Violence Defense by State, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return allStateDvLawsSlugs().map((state) => ({ state }));
}

export default async function Image({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const data = getStateDvLawsData(state);
  return renderOgImage({
    title: data
      ? `${data.name} Domestic Violence\nDefense Guide.`
      : "Domestic Violence Defense\nby State.",
    subtitle: data
      ? `${data.offenseClass}. Penalties, enhancements, and what to do next.`
      : undefined,
    category: "State Briefing",
  });
}
