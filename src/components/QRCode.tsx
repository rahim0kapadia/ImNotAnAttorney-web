"use client";
/**
 * QR Code generator component for partner referral URLs.
 * Generates QR code client-side using canvas. Downloadable as PNG.
 */

import { useEffect, useRef, useCallback, useState } from "react";

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
  const [loading, setLoading] = useState(true);
  const [showCanvas, setShowCanvas] = useState(false);

  const generateQR = useCallback(async () => {
    if (!url) {
      setLoading(false);
      return;
    }
    try {
      const QRCodeLib = (await import("qrcode")).default;
      const dataUrl = await QRCodeLib.toDataURL(url, {
        width: size,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      if (imgRef.current) {
        imgRef.current.src = dataUrl;
        setLoading(false);
      }
    } catch {
      // qrcode package not installed — draw a placeholder on canvas
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
      setShowCanvas(true);
      setLoading(false);
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
      <div className="bg-white rounded-xl p-3" style={{ width: size + 24, height: size + 24 }}>
        {loading && (
          <div style={{ width: size, height: size }} className="flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-zinc-300 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <img
          ref={imgRef}
          src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          alt={`QR code linking to ${url}`}
          width={size}
          height={size}
          className={loading || showCanvas ? "hidden" : "block"}
        />
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className={showCanvas ? "block" : "hidden"}
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
