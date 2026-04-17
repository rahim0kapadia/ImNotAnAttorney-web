import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { STANDALONE_PRODUCTS, getProduct, isValidProduct } from "@/lib/products";

export const alt = "Defense Guide, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return Object.entries(STANDALONE_PRODUCTS)
    .filter(([, p]) => p.category === "content" && p.isActive)
    .map(([slug]) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = isValidProduct(slug) ? getProduct(slug) : null;
  return renderOgImage({
    title: product?.name || "Defense Guide",
    subtitle: product?.description?.slice(0, 120),
    category: "State Briefing",
  });
}
