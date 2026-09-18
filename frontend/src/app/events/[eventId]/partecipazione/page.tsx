"use client";

import React, { useEffect, useState, useRef, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ShieldAlert, AlertCircle, X, FileUp, CheckCircle2 } from "lucide-react";
import { Select } from "@/components/atoms/Select/Select";
import { API_BASE_URL } from "@/lib/api";

export default function PartecipazioneForm({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      // Redirect to login if not authenticated
      window.location.href = "/login?callbackUrl=" + encodeURIComponent(window.location.pathname);
    },
  });

  const router = useRouter();
  
  const [modalita, setModalita] = useState<string>("IN_PRESENZA");
  const [soci, setSoci] = useState<{value: string, label: string}[]>([]);
  const [delegaA, setDelegaA] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  
  const [haIntolleranze, setHaIntolleranze] = useState<string>("NO");
  const [intolleranzeDetails, setIntolleranzeDetails] = useState<string>("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [eventTitle, setEventTitle] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch event details (e.g. assemblea title)
  useEffect(() => {
    async function fetchEventDetails() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/events/${eventId}`);
        if (res.ok) {
          const data = await res.json();
          setEventTitle(data.titolo || "");
        }
      } catch (e) {
        console.error("Failed to load event details", e);
      }
    }
    if (eventId) {
      fetchEventDetails();
    }
  }, [eventId]);

  // Fetch list of soci for dropdown
  useEffect(() => {
    async function fetchSoci() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/soci`);
        if (res.ok) {
          const data = await res.json();
          setSoci(data.map((s: any) => ({
            value: s.nome,
            label: `${s.nome} (${s.email})`
          })));
        }
      } catch (e) {
        console.error("Failed to load soci");
      }
    }
    fetchSoci();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalita === "ASSENTE" && (!delegaA || !file)) {
      setErrorMsg("Per giustificare l'assenza con delega è necessario selezionare un socio e allegare il PDF.");
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
      
      const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/delega`, {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json().catch(() => null);
      
      if (!res.ok) {
        throw new Error(data?.detail || "Si è verificato un errore durante l'invio.");
      }
      
      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Errore di connessione.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <main className="flex-1 flex flex-col items-center justify-center min-h-screen p-6 bg-[#253264]">
        <div className="text-white text-sm">Caricamento...</div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center min-h-screen p-6 bg-[#253264]">
        <div className="max-w-md w-full mx-auto p-10 bg-white rounded-xl shadow-2xl text-center space-y-4">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
          <h2 className="text-2xl font-bold text-[#1f295c] tracking-tight">Partecipazione Registrata</h2>
          {eventTitle && (
            <p className="text-sm font-semibold text-blue-600">
              {eventTitle}
            </p>
          )}
          <p className="text-sm text-gray-600">
            Grazie {session?.user?.name}, la tua scelta è stata salvata correttamente.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center min-h-screen p-6 bg-[#253264]">
      <div className="max-w-lg w-full mx-auto p-8 bg-white rounded-xl shadow-2xl">
        <div className="flex justify-center mb-6">
          <img src="/blu-verticale.svg" alt="JEMORE Logo" className="h-16 w-auto object-contain" />
        </div>
        
        <div className="text-center mb-4">
          <h2 className="text-2xl font-bold text-[#1f295c] tracking-tight">
            Modulo Partecipazione Assemblea
          </h2>
          {eventTitle && (
            <p className="text-base font-semibold text-blue-600 mt-1">
              {eventTitle}
            </p>
          )}
        </div>
        
        <div className="bg-blue-50 text-blue-800 text-[13px] font-medium py-3 px-4 rounded-lg mb-8 flex items-center justify-center gap-2 border border-blue-100 shadow-sm text-center">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Stai compilando come: <strong>{session?.user?.name}</strong>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <Select 
            label="Partecipazione"
            options={[
              { value: "IN_PRESENZA", label: "Presente (In Presenza)" },
              { value: "ONLINE", label: "Presente (Online)" },
              { value: "ASSENTE", label: "Assente (Delega)" }
            ]}
            value={modalita}
            onChange={(e) => setModalita(e.target.value)}
            forceLight={true}
          />
          
          <Select
            label="Hai intolleranze alimentari?"
            options={[
              { value: "NO", label: "No" },
              { value: "SI", label: "Sì" }
            ]}
            value={haIntolleranze}
            onChange={(e) => setHaIntolleranze(e.target.value)}
            forceLight={true}
          />

          {haIntolleranze === "SI" && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="text-xs font-bold text-[#1f295c] uppercase tracking-wide">
                Specifica Intolleranze
              </label>
              <textarea
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all resize-none shadow-sm"
                rows={3}
                placeholder="Es. Celiachia, Lattosio, Frutta a guscio..."
                value={intolleranzeDetails}
                onChange={(e) => setIntolleranzeDetails(e.target.value)}
                required={haIntolleranze === "SI"}
              />
            </div>
          )}

          {modalita === "ASSENTE" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
              <Select
                label="Socio a cui delegare"
                options={soci}
                value={delegaA}
                onChange={(e) => setDelegaA(e.target.value)}
                required={modalita === "ASSENTE"}
                forceLight={true}
              />
              
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1f295c] uppercase tracking-wide">
                  Carica Delega (PDF)
                </label>
                <div 
                  className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${file ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 bg-gray-50'}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className={`w-8 h-8 mb-2 ${file ? 'text-blue-500' : 'text-gray-400'}`} />
                  <span className="text-sm font-medium text-gray-700">
                    {file ? file.name : "Clicca per selezionare il file PDF"}
                  </span>
                  <input 
                    type="file" 
                    accept=".pdf" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setFile(e.target.files[0]);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3.5 rounded-full font-bold shadow-md transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? "Invio in corso..." : "Conferma Partecipazione"}
          </button>
        </form>
      </div>

      {/* Error Modal */}
      {errorMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-zinc-800 scale-in-center">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 flex justify-between items-center bg-red-50 dark:bg-red-900/20">
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Impossibile Registrare Delega
              </h3>
              <button 
                onClick={() => setErrorMsg(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 text-gray-700 dark:text-gray-300 font-medium">
              {errorMsg}
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-zinc-800/50 border-t border-gray-200 dark:border-zinc-800 flex justify-end">
              <button
                onClick={() => setErrorMsg(null)}
                className="px-5 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-800 dark:text-white rounded-full font-semibold transition-colors"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
