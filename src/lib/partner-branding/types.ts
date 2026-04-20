export type HexColor = `#${string}`;

export type BrandColorSource = "brandfetch" | "colorthief" | "manual";

export interface PartnerBrand {
  logoUrl: string | null;
  logoStoragePath: string | null;
  brandColorPrimary: HexColor | null;
  brandColorAccent: HexColor | null;
  brandColorBg: HexColor | null;
  brandColorSource: BrandColorSource | null;
  websiteUrl: string | null;
  brandContrastPassed: boolean;
  brandUpdatedAt: string | null;
}

export interface BrandfetchLogo {
  pngUrl: string;
  iconUrl: string;
  symbolUrl: string;
  domain: string;
}

export interface ExtractedPalette {
  primary: HexColor;
  accent: HexColor;
  primaryContrastOnBlack: number;
  primaryContrastOnWhite: number;
  textColor: "black" | "white";
}
