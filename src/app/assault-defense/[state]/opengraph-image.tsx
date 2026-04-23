import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { allStateAssaultLawsSlugs, getStateAssaultLawsData } from "@/data/state-assault-laws";

export const alt = "Assault Defense by State, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return allStateAssaultLawsSlugs().map((state) => ({ state }));
}

export default async function Image({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const data = getStateAssaultLawsData(state);
  return renderOgImage({
    title: data
      ? `${data.name} Assault\nDefense Guide.`
      : "Assault Defense\nby State.",
    subtitle: data
      ? `${data.offenseClass}. Penalties, enhancements, and what to do next.`
      : undefined,
    category: "State Briefing",
  });
}
