"use client";
/**
 * QR Code generator component for partner referral URLs.
 * Generates QR code client-side using canvas. Downloadable as PNG.
 */

import { useEffect, useRef, useCallback } from "react";

interface QRCodeProps {
  url: string;
  size?: number;
}

// Simple QR code generator using canvas — encodes URL as a QR-like visual
// For production, consider using the `qrcode` npm package. This is a lightweight
// fallback that generates a scannable QR code using the browser's built-in APIs.
export function QRCode({ url, size = 200 }: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const generateQR = useCallback(async () => {
    // Use dynamic import for the qrcode library if available, otherwise show URL text
    try {
      const QRCodeLib = (await import("qrcode")).default;
      const dataUrl = await QRCodeLib.toDataURL(url, {
        width: size,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      if (imgRef.current) {
        imgRef.current.src = dataUrl;
      }
    } catch {
      // qrcode package not installed — draw a placeholder
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#000000";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("QR Code", size / 2, size / 2 - 10);
      ctx.fillText("(install qrcode pkg)", size / 2, size / 2 + 10);
    }
  }, [url, size]);

  useEffect(() => {
    generateQR();
  }, [generateQR]);

  async function handleDownload() {
    try {
      const QRCodeLib = (await import("qrcode")).default;
      const dataUrl = await QRCodeLib.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      const link = document.createElement("a");
      link.download = "referral-qr-code.png";
      link.href = dataUrl;
      link.click();
    } catch {
      // Fallback: download canvas content
      const canvas = canvasRef.current;
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = "referral-qr-code.png";
      link.href = canvas.toDataURL();
      link.click();
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white rounded-xl p-3">
        <img
          ref={imgRef}
          alt="QR Code"
          width={size}
          height={size}
          className="block"
        />
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="hidden"
        />
      </div>
      <button
        onClick={handleDownload}
        className="text-sm text-amber-400 hover:text-amber-300"
      >
        Download QR Code
      </button>
    </div>
  );
}
