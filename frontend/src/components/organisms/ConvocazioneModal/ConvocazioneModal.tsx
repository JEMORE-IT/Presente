"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { X, Copy, Check, LayoutDashboard, Calendar, Clock, MapPin, Sparkles, Pencil, Loader2, ArrowLeft, Save } from "lucide-react";
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

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("18:30");
  const [editLocation, setEditLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentEvent(initialEvent);
    if (initialEvent) {
      if (initialEvent.tipo_assemblea && ["CAMBIO_RESP", "CAMBIO_BOARD", "STRATEGIA_BILANCIO"].includes(initialEvent.tipo_assemblea)) {
        setTipoAssemblea(initialEvent.tipo_assemblea as any);
      }
      initEditState(initialEvent);
    }
  }, [initialEvent]);

  const initEditState = (evt: typeof initialEvent) => {
    if (!evt) return;
    setEditTitle(evt.titolo || "");
    setEditLocation(evt.luogo || "Sede JEMORE");
    
    if (evt.data_ora) {
      const d = new Date(evt.data_ora);
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
  };

  if (!isOpen || !currentEvent) return null;

  // Format date and time
  const eventDateObj = new Date(currentEvent.data_ora);
  const dataFormatted = !isNaN(eventDateObj.getTime())
    ? eventDateObj.toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Data da definire";

  const orarioFormatted = !isNaN(eventDateObj.getTime())
    ? eventDateObj.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Orario da definire";

  const luogoFormatted = currentEvent.luogo && currentEvent.luogo.trim() !== "" ? currentEvent.luogo.trim() : "Sede JEMORE";

  const origin = typeof window !== "undefined" ? window.location.origin : "https://presente.jemore.it";
  const formUrl = currentEvent.form_slug
    ? `${origin}/partecipazione/${currentEvent.form_slug}`
    : `${origin}/partecipazione/${currentEvent.id}`;

  // Generate customized template text
  const generateMessage = () => {
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
  };

  const messageText = generateMessage();

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveEventDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      setSaveError("Il titolo dell'evento non può essere vuoto.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      let combinedIso = currentEvent.data_ora;
      if (editDate) {
        const timePart = editTime && editTime.trim() ? editTime : "18:30";
        const combined = new Date(`${editDate}T${timePart}:00`);
        if (!isNaN(combined.getTime())) {
          combinedIso = combined.toISOString();
        }
      }

      const res = await apiFetch(`${API_BASE_URL}/api/events/${currentEvent.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          titolo: editTitle.trim(),
          data_ora: combinedIso,
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
      setIsEditing(false);
    } catch (err: any) {
      setSaveError(err.message || "Impossibile salvare le modifiche.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/90">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl shadow-sm ${isEditing ? "bg-amber-600 text-white" : "bg-blue-600 text-white"}`}>
              {isEditing ? <Pencil className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {isEditing ? "Modifica Dati Assemblea / Evento" : "Template Convocazione Assemblea"}
              </h3>
              <p className="text-xs text-zinc-400">
                {isEditing
                  ? "Aggiorna nome, data, orario e luogo dell'evento."
                  : "Seleziona la tipologia e copia il messaggio pronto per la chat."}
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
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {isEditing ? (
            /* Edit Form View */
            <form id="edit-event-form" onSubmit={handleSaveEventDetails} className="space-y-4">
              {saveError && (
                <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-red-300 text-xs font-semibold">
                  {saveError}
                </div>
              )}

              {/* Titolo */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Titolo / Nome Evento *
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Es. AG Cambio Resp - Ottobre 2026"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-950 text-white text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Data e Orario */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Data *
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-950 text-white text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Orario Inizio *
                  </label>
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-950 text-white text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Luogo / Location */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Luogo / Location
                </label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="Es. Via Francesco Cassoli, 1, 42123 Reggio Emilia (RE)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-950 text-white text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Tipologia Assemblea */}
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
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        tipoAssemblea === item.id
                          ? "border-amber-500 bg-amber-600/20 text-amber-300"
                          : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      <span>{item.emoji}</span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </form>
          ) : (
            /* Template Preview View */
            <>
              {/* Tipo Assemblea Selection Pills */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                  Seleziona Tipo di Assemblea
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
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        tipoAssemblea === item.id
                          ? "border-blue-500 bg-blue-600/20 text-blue-300 shadow-sm"
                          : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      <span>{item.emoji}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Recap Badges */}
              <div className="flex flex-wrap items-center gap-3 p-3.5 bg-zinc-950 rounded-2xl border border-zinc-800 text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  {dataFormatted}
                </span>
                <span className="text-zinc-700">•</span>
                <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  {orarioFormatted}
                </span>
                <span className="text-zinc-700">•</span>
                <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-red-400" />
                  {luogoFormatted}
                </span>
              </div>

              {/* Message Box */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Messaggio Formattato
                  </label>
                  <span className="text-[11px] text-zinc-500">
                    Pronto per WhatsApp, Telegram o Email
                  </span>
                </div>
                <div className="relative">
                  <textarea
                    readOnly
                    rows={10}
                    value={messageText}
                    className="w-full p-4 text-xs sm:text-sm font-sans rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-200 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-5 bg-zinc-950 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          {isEditing ? (
            /* Actions in Edit Mode */
            <div className="w-full flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsEditing(false);
                  initEditState(currentEvent);
                }}
                disabled={saving}
                className="text-xs px-4 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Annulla
              </Button>

              <Button
                variant="primary"
                type="submit"
                form="edit-event-form"
                disabled={saving}
                className="text-xs px-5 py-2 gap-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-sm"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Salvataggio...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Salva Modifiche
                  </>
                )}
              </Button>
            </div>
          ) : (
            /* Actions in Template Preview Mode */
            <>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={handleCopy}
                  className={`text-xs px-3.5 py-2 gap-1.5 font-bold ${copied ? "text-emerald-400 border-emerald-500/50 bg-emerald-950/40" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border-zinc-700"}`}
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Messaggio Copiato!" : "Copia Messaggio"}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    initEditState(currentEvent);
                    setIsEditing(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-all shadow-sm cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Modifica Dati Evento
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};


