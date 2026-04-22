import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { allStateDrugLawsSlugs, getStateDrugLawsData } from "@/data/state-drug-laws";

export const alt = "Drug Possession Defense by State, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return allStateDrugLawsSlugs().map((state) => ({ state }));
}

export default async function Image({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const data = getStateDrugLawsData(state);
  return renderOgImage({
    title: data
      ? `${data.name} Drug Possession\nDefense Guide.`
      : "Drug Possession Defense\nby State.",
    subtitle: data
      ? `${data.offenseClass}. Penalties, enhancements, and what to do next.`
      : undefined,
    category: "State Briefing",
  });
}
