"use client";

import { useEffect, useRef, useState } from "react";

type DetectedBarcode = { boundingBox: DOMRectReadOnly };
type BarcodeDetectorLike = { detect(source: ImageBitmapSource): Promise<DetectedBarcode[]> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

export function PaymentQrImage({ src, alt }: { src: string; alt: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function cropToQr() {
      const image = imageRef.current;
      const canvas = canvasRef.current;
      if (!image || !canvas) return;
      try {
        const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
        if (!Detector) throw new Error("QR detection is unavailable in this browser.");
        const detector = new Detector({ formats: ["qr_code"] });
        const matches = await detector.detect(image);
        const box = matches[0]?.boundingBox;
        if (!box) throw new Error("QR code could not be detected.");
        const quiet = Math.max(box.width, box.height) * 0.08;
        const sx = Math.max(0, box.x - quiet);
        const sy = Math.max(0, box.y - quiet);
        const sw = Math.min(image.naturalWidth - sx, box.width + quiet * 2);
        const sh = Math.min(image.naturalHeight - sy, box.height + quiet * 2);
        const size = Math.ceil(Math.max(sw, sh));
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable.");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, size, size);
        context.imageSmoothingEnabled = false;
        const dx = (size - sw) / 2;
        const dy = (size - sh) / 2;
        context.drawImage(image, sx, sy, sw, sh, dx, dy, sw, sh);
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    }
    const image = imageRef.current;
    if (image?.complete) void cropToQr();
    else image?.addEventListener("load", cropToQr, { once: true });
    return () => {
      cancelled = true;
      image?.removeEventListener("load", cropToQr);
    };
  }, [src]);

  return (
    <div className="payment-qr-only">
      {/* Source stays visually hidden; only the detected QR crop is presented. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imageRef} src={src} alt="" aria-hidden="true" className="payment-qr-source" crossOrigin="anonymous" />
      <canvas ref={canvasRef} className="payment-qr" aria-label={alt} role="img" hidden={!ready} />
      {unavailable ? <p className="muted">QR preview is unavailable in this browser. Use the configured payment details below.</p> : null}
    </div>
  );
}
