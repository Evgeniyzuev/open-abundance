"use client";

import { ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUserContext } from "@/components/UserProvider";

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

/** Decodes a QR code from an image source: the browser's detector when it has one, jsQR otherwise. */
async function decodeQr(source: HTMLVideoElement | HTMLImageElement, canvas: HTMLCanvasElement): Promise<string | null> {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!width || !height) return null;
  const scale = Math.min(1, 720 / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  const Native = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  if (Native) {
    try {
      const found = await new Native({ formats: ["qr_code"] }).detect(canvas);
      if (found[0]?.rawValue) return found[0].rawValue;
    } catch { /* fall through to jsQR */ }
  }
  const { default: jsQR } = await import("jsqr");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

function QrScannerModal({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const { t } = useUserContext();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setMessage(t("scan.denied")); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        if (!stopped) setMessage(t("scan.denied"));
        return;
      }
      if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setCameraReady(true);

      const tick = async () => {
        if (stopped || !videoRef.current || !canvasRef.current) return;
        try {
          const text = await decodeQr(videoRef.current, canvasRef.current);
          if (text && !stopped) { stopped = true; onResult(text); return; }
        } catch { /* try the next frame */ }
        timer = window.setTimeout(tick, 150);
      };
      void tick();
    }
    void start();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // onResult is stable for the lifetime of the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromFile = useCallback(async (file: File | undefined) => {
    if (!file || !canvasRef.current) return;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("image")); image.src = url; });
      const text = await decodeQr(image, canvasRef.current);
      if (text) onResult(text);
      else setMessage(t("scan.notFound"));
    } catch {
      setMessage(t("scan.notFound"));
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [onResult, t]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet small qr-scanner" role="dialog" aria-modal="true" aria-label={t("scan.title")} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("scan.title")}</h2>
          <span />
        </div>
        <div className="qr-scanner-body">
          <div className="qr-scanner-view">
            <video ref={videoRef} playsInline muted />
            {cameraReady ? <span className="qr-scanner-frame" aria-hidden="true" /> : null}
          </div>
          <canvas ref={canvasRef} hidden />
          <p className="transfer-muted" role="status">{message ?? t("scan.hint")}</p>
          <label className="secondary-button qr-scanner-file">
            {t("scan.file")}
            <input type="file" accept="image/*" hidden onChange={(event) => { void fromFile(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
        </div>
      </section>
    </div>
  );
}

/** An icon button that opens the camera and hands back the text of the first QR code it reads. */
export default function ScanButton({ onScan }: { onScan: (text: string) => void }) {
  const { t } = useUserContext();
  const [open, setOpen] = useState(false);
  const handle = useCallback((text: string) => { setOpen(false); onScan(text); }, [onScan]);
  return (
    <>
      <button className="qr-scan-button" type="button" aria-label={t("scan.title")} title={t("scan.title")} onClick={() => setOpen(true)}>
        <ScanLine size={20} />
      </button>
      {open ? <QrScannerModal onResult={handle} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
