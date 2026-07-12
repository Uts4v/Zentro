// components/QRScanner.tsx
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X, Camera, AlertCircle } from "lucide-react";

interface QRScannerProps {
  open: boolean;
  onClose: () => void;
  onScanned: (url: string) => void;
}

export function QRScanner({ open, onClose, onScanned }: QRScannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) {
      stopScanner();
      return;
    }

    startScanner();

    return () => {
      stopScanner();
    };
  }, [open]);

  async function startScanner() {
    if (!containerRef.current) return;

    setError("");
    setScanning(true);

    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          handleResult(decodedText);
        },
        () => {
          // QR code not found on this frame — ignore
        }
      );
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg.includes("Permission")) {
        setError("Camera permission denied. Please allow camera access and try again.");
      } else if (msg.includes("NotFound")) {
        setError("No camera found on this device.");
      } else {
        setError("Could not start camera. Please try again.");
      }
    } finally {
      setScanning(false);
    }
  }

  async function stopScanner() {
    try {
      if (scannerRef.current) {
        const state = scannerRef.current.getState();
        if (state === 2) { // SCANNING
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  function handleResult(decodedText: string) {
    stopScanner();
    onScanned(decodedText);
  }

  function handleClose() {
    stopScanner();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between bg-black px-4 py-3">
        <div className="flex items-center gap-2 text-white">
          <Camera className="h-5 w-5" />
          <span className="font-medium">Scan table QR code</span>
        </div>
        <button
          onClick={handleClose}
          className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scanner viewport */}
      <div className="relative flex-1 flex items-center justify-center">
        <div
          id="qr-reader"
          ref={containerRef}
          className="h-full w-full"
        />

        {/* Scanning overlay frame */}
        {scanning && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-64 w-64 rounded-3xl border-2 border-white/40">
              <div className="h-full w-full animate-pulse rounded-3xl border-2 border-dashed border-white/20" />
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 px-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-400" />
            <p className="text-sm text-white/80">{error}</p>
            <button
              onClick={startScanner}
              className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Hint */}
      <div className="bg-black px-4 py-4 text-center">
        <p className="text-xs text-white/50">
          Point your camera at a table QR code
        </p>
      </div>
    </div>
  );
}
