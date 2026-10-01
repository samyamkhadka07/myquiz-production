"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export function PaymentQrImage({ src, alt }: { src: string; alt: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const previousOutput = canvasRef.current;
    if (previousOutput) {
      previousOutput.width = 0;
      previousOutput.height = 0;
    }

    function cropToQr() {
      const image = imageRef.current;
      const output = canvasRef.current;
      if (!image || !output || !image.naturalWidth || !image.naturalHeight) return;
      if (image.currentSrc !== src && image.src !== src) return;
      try {
        const scan = document.createElement("canvas");
        scan.width = image.naturalWidth;
        scan.height = image.naturalHeight;
        const scanContext = scan.getContext("2d", { willReadFrequently: true });
        if (!scanContext) throw new Error("Canvas is unavailable.");
        scanContext.drawImage(image, 0, 0);
        const pixels = scanContext.getImageData(0, 0, scan.width, scan.height);
        const code = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
        if (!code) throw new Error("QR code could not be detected.");

        const points = [
          code.location.topLeftCorner,
          code.location.topRightCorner,
          code.location.bottomLeftCorner,
          code.location.bottomRightCorner,
        ];
        const minX = Math.min(...points.map((point) => point.x));
        const maxX = Math.max(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxY = Math.max(...points.map((point) => point.y));
        const width = maxX - minX;
        const height = maxY - minY;
        const quiet = Math.max(width, height) * 0.1;
        const sx = Math.max(0, minX - quiet);
        const sy = Math.max(0, minY - quiet);
        const sw = Math.min(image.naturalWidth - sx, width + quiet * 2);
        const sh = Math.min(image.naturalHeight - sy, height + quiet * 2);
        const size = Math.ceil(Math.max(sw, sh));

        output.width = size;
        output.height = size;
        const context = output.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable.");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, size, size);
        context.imageSmoothingEnabled = false;
        context.drawImage(image, sx, sy, sw, sh, (size - sw) / 2, (size - sh) / 2, sw, sh);
        if (!cancelled) {
          setUnavailable(false);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setReady(false);
          setUnavailable(true);
        }
      }
    }

    const image = imageRef.current;
    if (image?.complete) cropToQr();
    else image?.addEventListener("load", cropToQr, { once: true });
    return () => {
      cancelled = true;
      image?.removeEventListener("load", cropToQr);
    };
  }, [src]);

  return (
    <div className="payment-qr-only">
      {/* The source image is never presented to the student; only its detected QR crop is rendered. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imageRef} src={src} alt="" aria-hidden="true" className="payment-qr-source" crossOrigin="anonymous" />
      <canvas ref={canvasRef} className="payment-qr" aria-label={alt} role="img" hidden={!ready} />
      {unavailable ? <p className="muted">QR preview could not be prepared. Use another configured payment method.</p> : null}
    </div>
  );
}
