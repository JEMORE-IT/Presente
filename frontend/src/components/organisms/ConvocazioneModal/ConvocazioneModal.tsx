"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { X, Copy, Check, LayoutDashboard, Sparkles, Pencil, Loader2, Save, Calendar, Clock, MapPin, AlertCircle } from "lucide-react";
import { Button } from "@/components/atoms/Button/Button";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { ConvocazioneModalProps } from "./ConvocazioneModal.types";

export const ConvocazioneModal: React.FC<ConvocazioneModalProps> = ({
  isOpen,
  onClose,
  event: initialEvent,
  onProceedToDashboard,
  onEventUpdated,
}) => {
  const { data: session } = useSession();
  const [currentEvent, setCurrentEvent] = useState(initialEvent);
  const [tipoAssemblea, setTipoAssemblea] = useState<"CAMBIO_RESP" | "CAMBIO_BOARD" | "STRATEGIA_BILANCIO">("CAMBIO_RESP");
  const [copied, setCopied] = useState(false);

  // Variable inputs
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("18:30");
  const [editLocation, setEditLocation] = useState("");
  
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentEvent(initialEvent);
    if (initialEvent) {
      if (initialEvent.tipo_assemblea && ["CAMBIO_RESP", "CAMBIO_BOARD", "STRATEGIA_BILANCIO"].includes(initialEvent.tipo_assemblea)) {
        setTipoAssemblea(initialEvent.tipo_assemblea as any);
      }
      setEditTitle(initialEvent.titolo || "");
      setEditLocation(initialEvent.luogo || "Sede JEMORE");
      
      if (initialEvent.data_ora) {
        // Parse date_ora safely without UTC offset shift
        const raw = String(initialEvent.data_ora);
        if (raw.includes("T")) {
          const [datePart, timePart] = raw.split("T");
          setEditDate(datePart);
          const timeClean = timePart.slice(0, 5);
          if (timeClean) setEditTime(timeClean);
        } else {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            setEditDate(`${yyyy}-${mm}-${dd}`);
            const hh = String(d.getHours()).padStart(2, "0");
            const min = String(d.getMinutes()).padStart(2, "0");
            setEditTime(`${hh}:${min}`);
          }
        }
      }
    }
  }, [initialEvent]);

  // Robust date formatting function in Italian
  const formatDateItalian = (dateString: string) => {
    if (!dateString) return "Data da definire";
    const parts = dateString.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString("it-IT", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      }
    }
    const dt = new Date(dateString);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    return dateString;
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "https://presente.jemore.it";
  const formUrl = currentEvent?.form_slug
    ? `${origin}/partecipazione/${currentEvent.form_slug}`
    : `${origin}/partecipazione/${currentEvent?.id || ""}`;

  // Live formatted variables
  const dataFormatted = formatDateItalian(editDate);
  const orarioFormatted = editTime && editTime.trim() ? editTime.trim() : "18:30";
  const luogoFormatted = editLocation && editLocation.trim() ? editLocation.trim() : "Sede JEMORE";

  // Generate customized template text dynamically
  const messageText = useMemo(() => {
    let focusText = "un appuntamento fondamentale per il Cambio Resp.";
    if (tipoAssemblea === "CAMBIO_BOARD") {
      focusText = "un momento cruciale per l'associazione: il Cambio Board.";
    } else if (tipoAssemblea === "STRATEGIA_BILANCIO") {
      focusText = "dedicata alla presentazione della Strategia e all'approvazione del Bilancio.";
    }

    return `Buongiorno a tutti! 👋
Siete tutti convocati per la prossima Assemblea Generale di JEMORE, ${focusText}

Ecco tutti i dettagli:
📅 Quando: ${dataFormatted}
⏰ Orario: ${orarioFormatted}
📍 Dove: ${luogoFormatted}

La presenza di ognuno di voi è fondamentale per decidere insieme la direzione di JEMORE per il prossimo anno. Vi chiediamo quindi di compilare i rispettivi form per confermare la presenza sia all'AG che alla cena (compresi eventuali regimi/intolleranze alimentari):
👉 [Conferma presenza AG QUI](${formUrl})

⚠️ Assenze e Deleghe:
Se proprio non riuscite a venire all'assemblea, ricordatevi di delegare un altro associato. Trovate in allegato il modulo di delega da compilare e caricare direttamente all'interno del form di presenza dell'AG. 📝

Piccolo promemoria da Statuto: alla seconda assenza non giustificata/senza delega scatta l'iter di esclusione dall'associazione, quindi occhio!

Ci vediamo presto!`;
  }, [tipoAssemblea, dataFormatted, orarioFormatted, luogoFormatted, formUrl]);

  if (!isOpen || !currentEvent) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveEventDetails = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editTitle.trim()) {
      setSaveError("Il titolo dell'evento non può essere vuoto.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const timePart = editTime && editTime.trim() ? editTime.trim() : "18:30";
      const localIso = editDate ? `${editDate}T${timePart}:00` : currentEvent.data_ora;

      const res = await apiFetch(`${API_BASE_URL}/api/events/${currentEvent.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          titolo: editTitle.trim(),
          data_ora: localIso,
          luogo: editLocation.trim(),
          tipo_assemblea: tipoAssemblea,
        }),
      }, session);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Errore durante l'aggiornamento dell'evento.");
      }

      const updated = await res.json();
      setCurrentEvent(updated);
      if (onEventUpdated) {
        onEventUpdated(updated);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      setSaveError(err.message || "Impossibile salvare le modifiche.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                Template Convocazione Assemblea
              </h3>
              <p className="text-xs text-zinc-400">
                Modifica le variabili e copia il messaggio convocazione generato in tempo reale.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {saveError && (
            <div className="p-3 bg-red-950/60 border border-red-800/60 rounded-xl text-red-300 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {saveError}
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 shrink-0" />
              Dati evento e orario salvati con successo sul database!
            </div>
          )}

          {/* Tipo Assemblea Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Tipologia Assemblea
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "CAMBIO_RESP", label: "Cambio Resp", emoji: "👥" },
                { id: "CAMBIO_BOARD", label: "Cambio Board", emoji: "🏛️" },
                { id: "STRATEGIA_BILANCIO", label: "Strategia & Bilancio", emoji: "📊" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTipoAssemblea(item.id as any)}
                  className={`flex items-center justify-center gap-2 py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    tipoAssemblea === item.id
                      ? "border-blue-500 bg-blue-600/20 text-blue-300 shadow-sm"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  <span>{item.emoji}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Inline Editable Fields for Event Variables */}
          <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Variabili Convocazione & Dati Evento
              </span>
              <button
                type="button"
                onClick={() => handleSaveEventDetails()}
                disabled={saving}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Salvataggio...
                  </>
                ) : (
                  <>
                    <Save className="w-3 h-3" /> Salva Dati su DB
                  </>
                )}
              </button>
            </div>

            {/* Titolo */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Nome Assemblea / Evento
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Es. AG Cambio Resp"
                className="w-full px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 text-white text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Data & Orario */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" /> Data
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 text-white text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-400" /> Orario Inizio
                </label>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 text-white text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Luogo */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-red-400" /> Luogo / Location
              </label>
              <input
                type="text"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="Es. Via Francesco Cassoli, 1, 42123 Reggio Emilia (RE)"
                className="w-full px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 text-white text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Message Box */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Messaggio Formattato (Aggiornato in tempo reale)
              </label>
              <span className="text-[11px] text-zinc-500">
                Pronto per WhatsApp, Telegram o Email
              </span>
            </div>
            <div className="relative">
              <textarea
                readOnly
                rows={9}
                value={messageText}
                className="w-full p-3.5 text-xs sm:text-sm font-sans rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-200 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 font-normal"
              />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-5 bg-zinc-950 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleCopy}
              className={`text-xs px-4 py-2 gap-1.5 font-bold ${copied ? "text-emerald-400 border-emerald-500/50 bg-emerald-950/40" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border-zinc-700"}`}
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? "Messaggio Copiato!" : "Copia Messaggio"}
            </Button>

            <button
              type="button"
              onClick={() => handleSaveEventDetails()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Salva Modifiche Evento
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                if (onProceedToDashboard) {
                  onProceedToDashboard(currentEvent.id);
                } else {
                  window.location.href = `/dashboard?event_id=${currentEvent.id}`;
                }
              }}
              className="text-xs px-4 py-2 gap-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-sm"
            >
              <LayoutDashboard className="w-4 h-4" />
              Vai alla Dashboard Evento
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};


