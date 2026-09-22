"use client";

import React, { useEffect, useState, useRef, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ShieldAlert, AlertCircle, X, FileUp, CheckCircle2, RotateCcw, Loader2 } from "lucide-react";
import { Select } from "@/components/atoms/Select/Select";
import { API_BASE_URL } from "@/lib/api";

interface EventData {
  id: number;
  titolo: string;
  tipo: string;
  modalita: string;
  data_ora?: string;
  is_attivo: boolean;
}

export default function PartecipazioneSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      window.location.href =
        "/login?callbackUrl=" + encodeURIComponent(window.location.pathname);
    },
  });

  const router = useRouter();

  const [eventData, setEventData] = useState<EventData | null>(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);

  const [modalita, setModalita] = useState<string>("IN_PRESENZA");
  const [soci, setSoci] = useState<{ value: string; label: string }[]>([]);
  const [delegaA, setDelegaA] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const [haIntolleranze, setHaIntolleranze] = useState<string>("NO");
  const [intolleranzeDetails, setIntolleranzeDetails] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch event details by slug
  useEffect(() => {
    async function fetchEventBySlug() {
      if (!slug) return;
      try {
        setEventLoading(true);
        setEventError(null);
        const res = await fetch(`${API_BASE_URL}/api/events/form/${slug}`);
        if (!res.ok) {
          throw new Error("Link di partecipazione non valido o assemblea non trovata.");
        }
        const data = await res.json();
        setEventData(data);
      } catch (e: any) {
        setEventError(e.message || "Impossibile caricare l'evento.");
      } finally {
        setEventLoading(false);
      }
    }
    fetchEventBySlug();
  }, [slug]);

  // Fetch list of active soci for delegation dropdown, excluding current user
  useEffect(() => {
    async function fetchSoci() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/soci?slug=${encodeURIComponent(slug)}`);
        if (res.ok) {
          const data = await res.json();
          const userEmail = session?.user?.email?.toLowerCase().trim();
          const userName = session?.user?.name?.toLowerCase().trim();

          // Exclude self from the potential delegates list
          const filtered = data.filter((s: any) => {
            const sEmail = s.email?.toLowerCase().trim();
            const sNome = s.nome?.toLowerCase().trim();
            if (userEmail && sEmail === userEmail) return false;
            if (userName && sNome === userName) return false;
            return true;
          });

          setSoci(
            filtered.map((s: any) => ({
              value: s.nome,
              label: `${s.nome} (${s.email})`,
            }))
          );
        }
      } catch (e) {
        console.error("Failed to load soci", e);
      }
    }
    if (session?.user) {
      fetchSoci();
    }
  }, [session?.user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalita === "ASSENTE" && (!delegaA || !file)) {
      setErrorMsg(
        "Per giustificare l'assenza con delega è necessario selezionare un socio e allegare il PDF firmato."
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append("email", session?.user?.email || "");
      formData.append("modalita", modalita);

      if (haIntolleranze === "SI" && intolleranzeDetails.trim()) {
        formData.append("intolleranze", intolleranzeDetails.trim());
      }

      if (modalita === "ASSENTE") {
        formData.append("delega_a", delegaA);
        if (file) formData.append("file", file);
      }

      const res = await fetch(`${API_BASE_URL}/api/events/form/${slug}/delega`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.detail || "Si è verificato un errore durante l'invio della risposta."
        );
      }

      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Errore di connessione.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setSuccess(false);
    setErrorMsg(null);
  };

  if (status === "loading" || eventLoading) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center min-h-screen p-6 bg-[#253264]">
        <div className="flex items-center gap-2 text-white text-sm font-medium">
          <Loader2 className="h-5 w-5 animate-spin" /> Caricamento modulo...
        </div>
      </main>
    );
  }

  if (eventError || !eventData) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center min-h-screen p-6 bg-[#253264]">
        <div className="max-w-md w-full mx-auto p-8 bg-white rounded-xl shadow-2xl text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-[#1f295c]">Link Non Valido</h2>
          <p className="text-sm text-gray-600">
            {eventError || "Il modulo di partecipazione richiesto non è più disponibile o il link non è corretto."}
          </p>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center min-h-screen p-6 bg-[#253264]">
        <div className="max-w-md w-full mx-auto p-10 bg-white rounded-xl shadow-2xl text-center space-y-5">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto animate-bounce-short" />
          <h2 className="text-2xl font-bold text-[#1f295c] tracking-tight">
            Partecipazione Registrata
          </h2>
          <p className="text-sm font-semibold text-blue-600 bg-blue-50 py-2 px-3 rounded-lg">
            {eventData.titolo}
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Grazie <strong>{session?.user?.name}</strong>, la tua risposta è stata salvata correttamente.
          </p>
          <p className="text-xs text-gray-400">
            Modalità registrata: <span className="font-semibold text-gray-700">{modalita === "ASSENTE" ? `Assente (Delega a ${delegaA})` : modalita}</span>
          </p>
          
          <div className="pt-3 border-t border-gray-100">
            <button
              onClick={handleResetForm}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Modifica risposta / Invia nuova scelta
            </button>
            <p className="text-[11px] text-gray-400 mt-2">
              Puoi ricompilare il modulo in qualsiasi momento: l&apos;ultima compilazione sovrascrive la precedente.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 bg-[#253264]">
      <div className="max-w-xl w-full mx-auto bg-white rounded-xl shadow-2xl overflow-hidden my-6">
        {/* Header con Brand */}
        <div className="bg-[#1f295c] p-6 text-white text-center border-b border-blue-900/40">
          <div className="flex justify-center mb-4">
            <img
              src="/bianco-orizzontale.svg"
              alt="JEMORE Logo"
              className="h-9 w-auto object-contain"
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            Modulo di Partecipazione
          </h1>
          <p className="text-sm text-blue-200 mt-1 font-medium">
            {eventData.titolo}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {/* Info Socio Loggato */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                Membro Connesso
              </span>
              <span className="font-bold text-gray-800 text-sm">
                {session?.user?.name}
              </span>
              <span className="text-xs text-gray-500 block">
                {session?.user?.email}
              </span>
            </div>
            <span className="text-xs px-2.5 py-1 bg-green-100 text-green-800 font-semibold rounded-full">
              Autenticato
            </span>
          </div>

          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 font-medium">{errorMsg}</p>
            </div>
          )}

          {/* Modalità Partecipazione */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">
              Come parteciperai all&apos;Assemblea? *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setModalita("IN_PRESENZA")}
                className={`py-3 px-4 border rounded-lg text-sm font-medium transition-all cursor-pointer text-center ${
                  modalita === "IN_PRESENZA"
                    ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-600/20"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                🏢 In Presenza
              </button>
              <button
                type="button"
                onClick={() => setModalita("ONLINE")}
                className={`py-3 px-4 border rounded-lg text-sm font-medium transition-all cursor-pointer text-center ${
                  modalita === "ONLINE"
                    ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-600/20"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                💻 Online
              </button>
              <button
                type="button"
                onClick={() => setModalita("ASSENTE")}
                className={`py-3 px-4 border rounded-lg text-sm font-medium transition-all cursor-pointer text-center ${
                  modalita === "ASSENTE"
                    ? "border-amber-600 bg-amber-50 text-amber-800 ring-2 ring-amber-600/20"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                📋 Assente (Delega)
              </button>
            </div>
          </div>

          {/* Sezione Presenza/Online -> Intolleranze Alimentari */}
          {modalita !== "ASSENTE" && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <label className="block text-sm font-semibold text-gray-700">
                Hai intolleranze o allergie alimentari?
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="haIntolleranze"
                    value="NO"
                    checked={haIntolleranze === "NO"}
                    onChange={(e) => setHaIntolleranze(e.target.value)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  No
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="haIntolleranze"
                    value="SI"
                    checked={haIntolleranze === "SI"}
                    onChange={(e) => setHaIntolleranze(e.target.value)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  Sì
                </label>
              </div>

              {haIntolleranze === "SI" && (
                <div className="pt-2">
                  <input
                    type="text"
                    placeholder="Specificare (es. Celiachia, Lattosio, Vegetariano...)"
                    value={intolleranzeDetails}
                    onChange={(e) => setIntolleranzeDetails(e.target.value)}
                    className="w-full text-sm border-gray-300 rounded-md shadow-xs focus:border-blue-500 focus:ring-blue-500 p-2.5 border"
                    required
                  />
                </div>
              )}
            </div>
          )}

          {/* Sezione Delega (Se Assente) */}
          {modalita === "ASSENTE" && (
            <div className="p-4 bg-amber-50/50 rounded-lg border border-amber-200 space-y-4">
              <h3 className="text-sm font-bold text-amber-900 border-b border-amber-200/60 pb-2">
                Dati della Delega
              </h3>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-700">
                  A chi deleghi il tuo voto? *
                </label>
                <Select
                  options={soci}
                  value={delegaA}
                  onChange={(e) => setDelegaA(e.target.value)}
                  required
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Nota: per regolamento statutario, ciascun socio può ricevere al massimo 3 deleghe. Il tuo nome non è selezionabile.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-700">
                  Carica Delega Firmata (PDF) *
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
                    file
                      ? "border-green-500 bg-green-50/30"
                      : "border-gray-300 hover:border-blue-500 bg-white"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setFile(e.target.files[0]);
                      }
                    }}
                  />
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-green-700">
                      <FileUp className="w-5 h-5" />
                      <span className="text-sm font-medium">{file.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                        }}
                        className="p-1 hover:bg-green-200 rounded-full text-green-800 ml-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1 text-gray-500">
                      <FileUp className="w-6 h-6 mx-auto text-gray-400" />
                      <div className="text-xs font-medium text-blue-600 hover:underline">
                        Clicca per selezionare il file PDF
                      </div>
                      <p className="text-[10px] text-gray-400">
                        Verrà archiviato in automatico su Microsoft Drive
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 px-4 bg-[#1f295c] hover:bg-[#161d42] text-white rounded-lg font-bold text-sm shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Salvataggio in corso...
              </>
            ) : (
              "Conferma Scelta Partecipazione"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
