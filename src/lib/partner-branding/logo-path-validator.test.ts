import { describe, it, expect } from "vitest";
import { validateLogoStoragePath } from "./logo-path-validator";

describe("validateLogoStoragePath", () => {
  const code = "ABC";

  it("accepts a valid path", () => {
    expect(validateLogoStoragePath("ABC/logo.png", code).ok).toBe(true);
    expect(validateLogoStoragePath("ABC/logo.jpg", code).ok).toBe(true);
    expect(validateLogoStoragePath("ABC/logo.jpeg", code).ok).toBe(true);
    expect(validateLogoStoragePath("ABC/logo.webp", code).ok).toBe(true);
  });
  it("accepts uppercase extension (case-insensitive)", () => {
    expect(validateLogoStoragePath("ABC/LOGO.PNG", code).ok).toBe(true);
    expect(validateLogoStoragePath("ABC/Logo.Png", code).ok).toBe(true);
  });
  it("accepts hashed filename", () => {
    expect(validateLogoStoragePath("ABC/logo-abc123.png", code).ok).toBe(true);
    expect(validateLogoStoragePath("ABC/logo_v2.webp", code).ok).toBe(true);
  });
  it("rejects parent-directory traversal", () => {
    expect(validateLogoStoragePath("ABC/../BB/logo.png", code).ok).toBe(false);
    expect(validateLogoStoragePath("../ABC/logo.png", code).ok).toBe(false);
    expect(validateLogoStoragePath("ABC/..", code).ok).toBe(false);
  });
  it("rejects cross-partner path", () => {
    expect(validateLogoStoragePath("BB/logo.png", code).ok).toBe(false);
    expect(validateLogoStoragePath("OTHER/logo.png", code).ok).toBe(false);
  });
  it("rejects bare segment without file", () => {
    expect(validateLogoStoragePath("ABC", code).ok).toBe(false);
    expect(validateLogoStoragePath("ABC/", code).ok).toBe(false);
    expect(validateLogoStoragePath("", code).ok).toBe(false);
  });
  it("rejects dotfile / leading-dot filenames", () => {
    expect(validateLogoStoragePath("ABC/.hidden.png", code).ok).toBe(false);
  });
  it("rejects non-allowed extensions", () => {
    expect(validateLogoStoragePath("ABC/logo.exe", code).ok).toBe(false);
    expect(validateLogoStoragePath("ABC/logo.png.exe", code).ok).toBe(false);
    expect(validateLogoStoragePath("ABC/logo.svg", code).ok).toBe(false);
    expect(validateLogoStoragePath("ABC/logo.gif", code).ok).toBe(false);
  });
  it("rejects URL-encoded traversal", () => {
    expect(validateLogoStoragePath("ABC%2F..%2FBB%2Flogo.png", code).ok).toBe(false);
    expect(validateLogoStoragePath("ABC%2Flogo.png", code).ok).toBe(false);
  });
  it("rejects backslash (Windows-style traversal)", () => {
    expect(validateLogoStoragePath("ABC\\logo.png", code).ok).toBe(false);
  });
  it("rejects null byte", () => {
    expect(validateLogoStoragePath("ABC/logo.png\0.exe", code).ok).toBe(false);
  });
  it("rejects nested folders", () => {
    expect(validateLogoStoragePath("ABC/subdir/logo.png", code).ok).toBe(false);
  });
  it("rejects non-alphanumeric leading char in filename", () => {
    expect(validateLogoStoragePath("ABC/-logo.png", code).ok).toBe(false);
    expect(validateLogoStoragePath("ABC/.logo.png", code).ok).toBe(false);
  });
  it("rejects missing partner promo_code", () => {
    expect(validateLogoStoragePath("ABC/logo.png", null).ok).toBe(false);
    expect(validateLogoStoragePath("ABC/logo.png", "").ok).toBe(false);
    expect(validateLogoStoragePath("ABC/logo.png", undefined).ok).toBe(false);
  });
  it("rejects oversize input", () => {
    const tooLong = "ABC/" + "a".repeat(500) + ".png";
    expect(validateLogoStoragePath(tooLong, code).ok).toBe(false);
  });
  it("case-normalizes the first-segment vs promo_code comparison", () => {
    expect(validateLogoStoragePath("abc/logo.png", "ABC").ok).toBe(true);
    expect(validateLogoStoragePath("ABC/logo.png", "abc").ok).toBe(true);
  });
});
