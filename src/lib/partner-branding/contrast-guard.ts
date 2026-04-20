import type { HexColor } from "./types";

function clampChannel(ch: number): number {
  if (ch < 0) return 0;
  if (ch > 255) return 255;
  return ch;
}

export function parseHex(input: string): { r: number; g: number; b: number } | null {
  if (typeof input !== "string") return null;
  const hex = input.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function isHexColor(input: string): input is HexColor {
  return /^#[0-9A-Fa-f]{6}$/.test(input);
}

export function toHex(r: number, g: number, b: number): HexColor {
  const hr = clampChannel(Math.round(r)).toString(16).padStart(2, "0");
  const hg = clampChannel(Math.round(g)).toString(16).padStart(2, "0");
  const hb = clampChannel(Math.round(b)).toString(16).padStart(2, "0");
  return `#${hr}${hg}${hb}`.toUpperCase() as HexColor;
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const R = srgbToLinear(rgb.r);
  const G = srgbToLinear(rgb.g);
  const B = srgbToLinear(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastRatio(fg: string, bg: string): number {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastCheck {
  passes: boolean;
  ratio: number;
  threshold: number;
}

export function assertWcagAA(fg: string, bg: string): ContrastCheck {
  const ratio = contrastRatio(fg, bg);
  return { passes: ratio >= 4.5, ratio, threshold: 4.5 };
}

export function assertWcagAALarge(fg: string, bg: string): ContrastCheck {
  const ratio = contrastRatio(fg, bg);
  return { passes: ratio >= 3, ratio, threshold: 3 };
}

export function assertWcagAAA(fg: string, bg: string): ContrastCheck {
  const ratio = contrastRatio(fg, bg);
  return { passes: ratio >= 7, ratio, threshold: 7 };
}

export function bestTextColor(bg: string): "black" | "white" {
  const onBlack = contrastRatio(bg, "#000000");
  const onWhite = contrastRatio(bg, "#FFFFFF");
  return onWhite >= onBlack ? "white" : "black";
}

export function passesAgainstEither(fg: string, bg1: string, bg2: string): boolean {
  return assertWcagAA(fg, bg1).passes || assertWcagAA(fg, bg2).passes;
}

export const SITE_DARK_BG: HexColor = "#000000";
export const SITE_LIGHT_FG: HexColor = "#FFFFFF";

/**
 * Site-specific contrast guard. The INAA site renders a dark (#000) canvas,
 * so partner primary color is only meaningful if it passes WCAG AA against
 * black. (Checking OR against white is mathematically useless — no valid
 * color fails AA against BOTH black and white, so that check always returns
 * true.) Partner colors too dark to sit on our canvas get rejected here and
 * the shell falls back to INAA amber.
 */
export function brandPassesSiteContrast(brandHex: string): boolean {
  if (!isHexColor(brandHex)) return false;
  return assertWcagAA(brandHex, SITE_DARK_BG).passes;
}
