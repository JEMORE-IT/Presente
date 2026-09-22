"use client";

import React, { useEffect, useState, use } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { API_BASE_URL } from "@/lib/api";
import { Button } from "@/components/atoms/Button/Button";
import {
  UserCheck,
  LogOut,
  ShieldAlert,
  CheckCircle2,
  UserCircle,
  Wifi,
  MapPin,
  Loader2,
  RotateCcw,
} from "lucide-react";

interface EventInfo {
  event_id: number;
  titolo: string;
  tipo: string;
  modalita: string;
  data_ora?: string;
  is_attivo: boolean;
}

export default function CheckinCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { data: session, status } = useSession();

  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);

  const [modality, setModality] = useState<"IN_PRESENZA" | "ONLINE">("IN_PRESENZA");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Load event info via QR code resolution endpoint
  useEffect(() => {
    async function loadEventByCode() {
      if (!code) return;
      try {
        setEventLoading(true);
        setEventError(null);
        const res = await fetch(`${API_BASE_URL}/api/checkin/qr/${encodeURIComponent(code)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.detail || "Codice QR non valido o scaduto (validità 24 ore).");
        }
        const data = await res.json();
        setEventInfo(data);
        if (data.modalita === "ONLINE_ONLY") {
          setModality("ONLINE");
        } else {
          setModality("IN_PRESENZA");
        }
      } catch (err: any) {
        setEventError(err.message || "Errore nel verificare il codice QR.");
      } finally {
        setEventLoading(false);
      }
    }

    loadEventByCode();
  }, [code]);

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
    setSuccess(false);
    setError("");
  };

  const handleConfirmPresence = async () => {
    if (!code) {
      setError("Parametri non validi. Riscansiona il codice QR.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = (session as any)?.idToken;
      const res = await fetch(`${API_BASE_URL}/api/checkin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          code: code,
          modalita: modality,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Errore durante la registrazione del check-in.");
      }

      setSuccess(true);
      setSuccessMsg(
        `Presenza registrata alle ${new Date().toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
        })}!`
      );
    } catch (err: any) {
      setError(err.message || "Impossibile registrare la presenza.");
    } finally {
      setLoading(false);
    }
  };

  // 1. Loading event info
  if (eventLoading || status === "loading") {
    return (
      <main className="min-h-screen bg-[#253264] flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-white text-sm font-medium">
          <Loader2 className="h-6 w-6 animate-spin text-blue-300" />
          Verifica codice QR in corso...
        </div>
      </main>
    );
  }

  // 2. Invalid or expired QR code
  if (eventError || !eventInfo) {
    return (
      <main className="min-h-screen bg-[#253264] flex items-center justify-center p-4">
        <div className="max-w-md w-full mx-auto p-8 bg-white rounded-xl shadow-2xl text-center space-y-4">
          <div className="flex justify-center mb-2">
            <img
              src="/blu-verticale.svg"
              alt="JEMORE Logo"
              className="h-16 w-auto object-contain"
            />
          </div>
          <ShieldAlert className="h-12 w-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-[#1f295c]">Codice Non Valido</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            {eventError || "Il codice QR inquadrato è scaduto o non è valido. I codici QR hanno una validità di 24 ore. Inquadra il codice QR proiettato."}
          </p>
        </div>
      </main>
    );
  }

  // 3. User not authenticated
  if (!session?.user) {
    return (
      <main className="min-h-screen bg-[#253264] flex items-center justify-center p-4">
        <div className="max-w-md w-full mx-auto p-8 bg-white rounded-xl shadow-2xl text-center space-y-5">
          <div className="flex justify-center mb-2">
            <img
              src="/blu-verticale.svg"
              alt="JEMORE Logo"
              className="h-16 w-auto object-contain"
            />
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">Evento</p>
            <p className="text-lg font-bold text-[#1f295c] mt-0.5">{eventInfo.titolo}</p>
          </div>
          <h2 className="text-xl font-bold text-[#1f295c]">Accesso Richiesto</h2>
          <p className="text-sm text-gray-600">
            Per registrare la tua presenza a questo evento, effettua l&apos;accesso con il tuo account @jemore.it.
          </p>
          <Button
            onClick={() =>
              signIn(undefined, {
                callbackUrl: window.location.pathname,
              })
            }
            className="w-full py-3 font-semibold text-sm bg-[#1f295c] hover:bg-[#161d42] text-white"
          >
            Accedi per Registrare Presenza
          </Button>
        </div>
      </main>
    );
  }

  // 4. Success screen
  if (success) {
    return (
      <main className="min-h-screen bg-[#253264] flex items-center justify-center p-4">
        <div className="max-w-md w-full mx-auto p-10 bg-white rounded-xl shadow-2xl text-center space-y-4">
          <div className="flex justify-center mb-2">
            <img
              src="/blu-verticale.svg"
              alt="JEMORE Logo"
              className="h-16 w-auto object-contain"
            />
          </div>
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto animate-bounce-short" />
          <h2 className="text-2xl font-bold text-[#1f295c]">Presenza Confermata!</h2>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs text-blue-600 font-semibold uppercase">Evento</p>
            <p className="text-base font-bold text-[#1f295c]">{eventInfo.titolo}</p>
            <p className="text-xs font-semibold text-blue-700 mt-1">
              Modalità: {modality === "IN_PRESENZA" ? "🏢 In Presenza" : "💻 Online"}
            </p>
          </div>
          <p className="text-sm text-gray-600">
            Bentornato, <strong>{session.user.name}</strong>. {successMsg}
          </p>

          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={() => setSuccess(false)}
              className="inline-flex items-center gap-2 text-xs text-gray-500 hover:text-[#1f295c] font-semibold cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Modifica modalità presenza
            </button>
          </div>
        </div>
      </main>
    );
  }

  const isOnlineOnly = eventInfo.modalita === "ONLINE_ONLY";
  const isInPersonOnly = eventInfo.modalita === "IN_PERSON_ONLY";
  const isHybrid = !isOnlineOnly && !isInPersonOnly;

  // 5. Active check-in form
  return (
    <main className="min-h-screen bg-[#253264] flex items-center justify-center p-4">
      <div className="max-w-md w-full mx-auto p-6 sm:p-8 bg-white rounded-xl shadow-2xl text-center space-y-5">
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <img
            src="/blu-verticale.svg"
            alt="JEMORE Logo"
            className="h-16 w-auto object-contain"
          />
        </div>

        {/* User bar */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3 text-left">
          <div className="flex items-center gap-2.5 text-sm">
            <UserCircle className="h-6 w-6 text-gray-400" />
            <div>
              <p className="font-semibold text-[#1f295c] leading-tight">{session.user.name}</p>
              <p className="text-xs text-gray-500 leading-tight">{session.user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Cambia account"
            className="text-gray-400 hover:text-red-500 transition-colors p-1"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold flex items-start gap-2 text-left">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Event card */}
        <div className="bg-gray-50 p-4 border border-gray-200 rounded-lg text-left">
          <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
            Evento
          </span>
          <h2 className="text-lg font-bold text-[#1f295c] mt-0.5">
            {eventInfo.titolo}
          </h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
              {eventInfo.tipo}
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-200 text-gray-700 font-semibold">
              {isHybrid ? "Ibrida" : isInPersonOnly ? "In Presenza" : "Online"}
            </span>
          </div>
        </div>

        {/* Modality selector: MUST have BOTH "In Presenza" and "Online" if hybrid / selectable */}
        {isHybrid && (
          <div className="space-y-2 text-left">
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
              Come stai partecipando? *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setModality("IN_PRESENZA")}
                className={`py-3 px-3 border rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  modality === "IN_PRESENZA"
                    ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-600/20 shadow-xs"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <MapPin className="h-4 w-4 shrink-0 text-blue-600" />
                In Presenza
              </button>

              <button
                type="button"
                onClick={() => setModality("ONLINE")}
                className={`py-3 px-3 border rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  modality === "ONLINE"
                    ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-600/20 shadow-xs"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Wifi className="h-4 w-4 shrink-0 text-blue-600" />
                Online
              </button>
            </div>
          </div>
        )}

        {/* Informative banners for single-modality events */}
        {isInPersonOnly && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs font-semibold text-blue-800 flex items-center gap-2 text-left">
            <MapPin className="h-4 w-4 shrink-0 text-blue-600" />
            Evento esclusivamente In Presenza.
          </div>
        )}

        {isOnlineOnly && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs font-semibold text-blue-800 flex items-center gap-2 text-left">
            <Wifi className="h-4 w-4 shrink-0 text-blue-600" />
            Evento Online — la modalità è impostata automaticamente su Online.
          </div>
        )}

        {/* Confirm CTA */}
        <Button
          onClick={handleConfirmPresence}
          variant="success"
          isLoading={loading}
          className="w-full py-3.5 text-sm font-bold gap-2 cursor-pointer"
        >
          <UserCheck className="h-4 w-4" />
          Conferma Presenza
        </Button>
      </div>
    </main>
  );
}
