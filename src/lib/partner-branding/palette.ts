import type { ExtractedPalette, HexColor } from "./types";
import {
  bestTextColor,
  brandPassesSiteContrast,
  contrastRatio,
  SITE_DARK_BG,
  SITE_LIGHT_FG,
  toHex,
} from "./contrast-guard";

const SAMPLE_STRIDE = 4;
const MIN_DISTANCE_BETWEEN_TOP_COLORS = 60;

interface Bucket {
  r: number;
  g: number;
  b: number;
  count: number;
}

function quantizeChannel(c: number): number {
  return Math.round(c / 16) * 16;
}

function rgbKey(r: number, g: number, b: number): string {
  return `${r}|${g}|${b}`;
}

function shouldIncludePixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 125) return false;
  const avg = (r + g + b) / 3;
  if (avg < 16) return false;
  if (avg > 240) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 12) return false;
  return true;
}

function euclideanDistance(a: Bucket, b: Bucket): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function bucketsFromImageData(pixels: Uint8ClampedArray): Bucket[] {
  const counts = new Map<string, Bucket>();
  for (let i = 0; i < pixels.length; i += 4 * SAMPLE_STRIDE) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (!shouldIncludePixel(r, g, b, a)) continue;
    const qr = quantizeChannel(r);
    const qg = quantizeChannel(g);
    const qb = quantizeChannel(b);
    const key = rgbKey(qr, qg, qb);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { r: qr, g: qg, b: qb, count: 1 });
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

function pickAccent(primary: Bucket, buckets: Bucket[]): Bucket {
  for (const candidate of buckets) {
    if (candidate === primary) continue;
    if (euclideanDistance(primary, candidate) >= MIN_DISTANCE_BETWEEN_TOP_COLORS) {
      return candidate;
    }
  }
  return buckets[1] ?? primary;
}

export interface ImageSource {
  width: number;
  height: number;
  getContext(kind: "2d"): { drawImage(img: unknown, x: number, y: number): void; getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } } | null;
}

export function extractPaletteFromPixels(pixels: Uint8ClampedArray): ExtractedPalette | null {
  const buckets = bucketsFromImageData(pixels);
  if (buckets.length === 0) return null;
  const primaryBucket = buckets[0];
  const accentBucket = pickAccent(primaryBucket, buckets);
  const primary = toHex(primaryBucket.r, primaryBucket.g, primaryBucket.b);
  const accent = toHex(accentBucket.r, accentBucket.g, accentBucket.b);
  return {
    primary,
    accent,
    primaryContrastOnBlack: contrastRatio(primary, SITE_DARK_BG),
    primaryContrastOnWhite: contrastRatio(primary, SITE_LIGHT_FG),
    textColor: bestTextColor(primary),
  };
}

export async function extractPaletteFromUrl(url: string): Promise<ExtractedPalette | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const maxSide = 256;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve(extractPaletteFromPixels(imageData.data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function paletteMeetsContrast(palette: ExtractedPalette): boolean {
  return brandPassesSiteContrast(palette.primary);
}

export function validateAndNarrowPalette(
  primary: string,
  accent: string | null,
): { ok: true; primary: HexColor; accent: HexColor | null } | { ok: false; reason: string } {
  const hexRegex = /^#[0-9A-Fa-f]{6}$/;
  if (!hexRegex.test(primary)) {
    return { ok: false, reason: "Primary color must be #RRGGBB." };
  }
  if (accent && !hexRegex.test(accent)) {
    return { ok: false, reason: "Accent color must be #RRGGBB." };
  }
  if (!brandPassesSiteContrast(primary)) {
    return {
      ok: false,
      reason: "Primary color fails WCAG AA against both black and white backgrounds (4.5:1).",
    };
  }
  return {
    ok: true,
    primary: primary.toUpperCase() as HexColor,
    accent: accent ? (accent.toUpperCase() as HexColor) : null,
  };
}
