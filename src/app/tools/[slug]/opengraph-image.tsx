import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { getProduct, isValidProduct } from "@/lib/products";

export const alt = "Defense Tool — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = isValidProduct(slug) ? getProduct(slug) : null;
  return renderOgImage({
    title: product?.name || "Defense Tool",
    subtitle: product?.description?.slice(0, 100),
    eyebrow: "Free Tool",
  });
}
