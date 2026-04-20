/**
 * Magic-byte file type sniffing. Browser-supplied MIME is spoofable.
 * We match on the first bytes of the uploaded blob.
 * Supported types: PNG, JPEG, WEBP. SVG is intentionally NOT allowed
 * (SVG can carry <script> and would persist XSS on the public bucket).
 */

export type SniffedType = "png" | "jpeg" | "webp" | null;

export const ALLOWED_IMAGE_MIMES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export function sniffImageType(bytes: Uint8Array): SniffedType {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "webp";
  }
  return null;
}

export function mimeForSniffed(kind: SniffedType): string | null {
  if (kind === "png") return "image/png";
  if (kind === "jpeg") return "image/jpeg";
  if (kind === "webp") return "image/webp";
  return null;
}

export function extForSniffed(kind: SniffedType): string | null {
  if (kind === "png") return "png";
  if (kind === "jpeg") return "jpg";
  if (kind === "webp") return "webp";
  return null;
}
