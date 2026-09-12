import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { QrProjectorModalProps } from "./QrProjectorModal.types";
import { X, Smartphone, Copy, Check } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

export const QrProjectorModal: React.FC<QrProjectorModalProps> = ({
  isOpen,
  onClose,
  eventId,
  eventTitle = "Evento",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [checkinUrl, setCheckinUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  // Build and render QR code whenever modal opens or event changes
  useEffect(() => {
    if (!isOpen || !eventId) {
      setCheckinUrl("");
      return;
    }

    const generateUrl = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/qr`);
        if (res.ok) {
          const data = await res.json();
          const origin =
            typeof window !== "undefined"
              ? window.location.origin
              : "http://localhost:3000";
          const url = `${origin}/checkin?event_id=${eventId}&token=${data.static_token}`;
          setCheckinUrl(url);
          setError("");

          if (canvasRef.current) {
            QRCode.toCanvas(
              canvasRef.current,
              url,
              {
                width: 280,
                margin: 2,
                color: {
                  dark: "#18181b",
                  light: "#ffffff",
                },
              },
              (err) => {
                if (err) {
                  console.error("QR Code generation error:", err);
                  setError("Impossibile generare l'immagine QR Code");
                }
              }
            );
          }
        }
      } catch (e) {
        console.error(e);
        setError("Errore nel recupero del token evento");
      }
    };
    generateUrl();

  }, [isOpen, eventId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(checkinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select the text manually
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50">
          <div>
            <h2 className="text-lg font-bold text-[#1f295c] dark:text-white">
              Proietta QR Code
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
              {eventTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* QR Content */}
        <div className="p-6 flex flex-col items-center gap-5 bg-white dark:bg-zinc-900">
          {error ? (
            <div className="text-center py-6">
              <p className="text-red-500 text-sm font-semibold">{error}</p>
            </div>
          ) : (
            <>
              {/* QR Canvas */}
              <div className="bg-white p-4 rounded-xl border border-gray-100 dark:border-zinc-700 shadow-md">
                <canvas ref={canvasRef} />
              </div>

              {/* Instruction */}
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 font-medium text-center">
                <Smartphone className="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
                Inquadra il QR con lo smartphone, seleziona il tuo nome e conferma la presenza.
              </div>

              {/* URL copy row */}
              <div className="w-full flex items-center gap-2 bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2">
                <span className="flex-1 text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
                  {checkinUrl}
                </span>
                <button
                  onClick={handleCopy}
                  title="Copia link"
                  className="shrink-0 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50 text-center text-xs text-gray-400 dark:text-gray-500">
          Il link è permanente per questo evento. La presenza viene registrata al momento della conferma.
        </div>
      </div>
    </div>
  );
};
