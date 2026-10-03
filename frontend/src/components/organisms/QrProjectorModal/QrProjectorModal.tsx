import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import QRCode from "qrcode";
import { QrProjectorModalProps } from "./QrProjectorModal.types";
import { X, Smartphone, Copy, Check, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { API_BASE_URL, apiFetch } from "@/lib/api";

export const QrProjectorModal: React.FC<QrProjectorModalProps> = ({
  isOpen,
  onClose,
  eventId,
  eventTitle = "Evento",
  onQrRegenerated,
}) => {
  const { data: session } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [checkinUrl, setCheckinUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const renderQrCanvas = useCallback((url: string) => {
    if (canvasRef.current && url) {
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
  }, []);

  // Fetch QR Code data
  const fetchQrCode = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/events/${eventId}/qr`, {}, session);
      if (res.ok) {
        const data = await res.json();
        const origin =
          typeof window !== "undefined"
            ? window.location.origin
            : "https://presente.jemore.it";
        const code = data.daily_code || data.token || data.static_token;
        const url = `${origin}/checkin/${code}`;
        setCheckinUrl(url);
        setError("");
        renderQrCanvas(url);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Errore nel recupero del token evento");
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Errore di connessione al server");
    }
  }, [eventId, session, renderQrCanvas]);

  useEffect(() => {
    if (!isOpen || !eventId) {
      setCheckinUrl("");
      setShowConfirmReset(false);
      setSuccessMessage("");
      return;
    }

    fetchQrCode();
  }, [isOpen, eventId, fetchQrCode]);

  // Handle QR Regeneration & Reset Records
  const handleRegenerateQr = async () => {
    if (!eventId) return;
    setIsRegenerating(true);
    setError("");
    setSuccessMessage("");

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/events/${eventId}/regenerate-qr`, {
        method: "POST",
      }, session);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Errore durante la rigenerazione del QR Code");
      }

      const data = await res.json();
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "https://presente.jemore.it";
      const code = data.daily_code || data.token || data.static_token;
      const url = `${origin}/checkin/${code}`;
      setCheckinUrl(url);
      renderQrCanvas(url);
      setShowConfirmReset(false);
      setSuccessMessage("Nuovo QR Code attivo! Presenze precedenti azzerate con successo.");
      setTimeout(() => setSuccessMessage(""), 5000);

      if (onQrRegenerated) {
        onQrRegenerated();
      }
    } catch (err: any) {
      setError(err.message || "Impossibile rigenerare il QR Code.");
    } finally {
      setIsRegenerating(false);
    }
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-950/80">
          <div>
            <h2 className="text-lg font-bold text-white">
              Proietta QR Code
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5 font-medium truncate max-w-[280px]">
              {eventTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* QR Content */}
        <div className="p-6 flex flex-col items-center gap-4 bg-zinc-900">
          {error && (
            <div className="w-full text-center py-2.5 px-3 bg-red-950/60 border border-red-800/60 rounded-xl text-red-300 text-xs font-semibold">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="w-full text-center py-2.5 px-3 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs font-semibold animate-in fade-in">
              {successMessage}
            </div>
          )}

          {/* QR Canvas */}
          <div className="bg-white p-4 rounded-2xl border border-zinc-700 shadow-xl">
            <canvas ref={canvasRef} />
          </div>

          {/* Instruction */}
          <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-300 font-medium text-center">
            <Smartphone className="h-4 w-4 shrink-0 text-blue-400" />
            Inquadra il QR con lo smartphone, seleziona il tuo nome e conferma la presenza.
          </div>

          {/* URL copy row */}
          <div className="w-full flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5">
            <span className="flex-1 text-xs font-mono text-zinc-400 truncate">
              {checkinUrl}
            </span>
            <button
              onClick={handleCopy}
              title="Copia link"
              className="shrink-0 text-zinc-400 hover:text-blue-400 transition-colors cursor-pointer"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Regenerate QR Code / Revert Presenze Section */}
          <div className="w-full pt-1">
            {showConfirmReset ? (
              <div className="p-3.5 bg-amber-950/40 border border-amber-800/60 rounded-2xl space-y-2.5 text-center animate-in fade-in">
                <div className="flex items-center justify-center gap-1.5 text-amber-300 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  Confermi la rigenerazione del QR?
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  Verrà generato un <strong>nuovo QR Code</strong> e tutti i soci torneranno al loro <strong>stato iniziale</strong> (chi era pre-registrato o assente torna a pre-registrato/assente), consentendo a tutti di effettuare nuovamente il check-in.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isRegenerating}
                    onClick={() => setShowConfirmReset(false)}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    disabled={isRegenerating}
                    onClick={handleRegenerateQr}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-500 text-white shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    {isRegenerating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Rigenerazione...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" /> Sì, Rigenera & Reimposta
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowConfirmReset(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-zinc-800 bg-zinc-950/80 hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 text-xs font-semibold transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Genera Nuovo QR Code & Reimposta Presenze
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 text-center text-xs text-zinc-500">
          Il link è permanente per questo evento. La presenza viene registrata al momento della conferma.
        </div>
      </div>
    </div>
  );
};
