"use client";

import React, { useState, useEffect } from "react";
import { X, Copy, Check, Send, LayoutDashboard, Calendar, Clock, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/atoms/Button/Button";
import { ConvocazioneModalProps } from "./ConvocazioneModal.types";

export const ConvocazioneModal: React.FC<ConvocazioneModalProps> = ({
  isOpen,
  onClose,
  event,
  onProceedToDashboard,
}) => {
  const [tipoAssemblea, setTipoAssemblea] = useState<"CAMBIO_RESP" | "CAMBIO_BOARD" | "STRATEGIA_BILANCIO">("CAMBIO_RESP");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (event?.tipo_assemblea) {
      if (["CAMBIO_RESP", "CAMBIO_BOARD", "STRATEGIA_BILANCIO"].includes(event.tipo_assemblea)) {
        setTipoAssemblea(event.tipo_assemblea as any);
      }
    }
  }, [event]);

  if (!isOpen || !event) return null;

  // Format date and time
  const eventDateObj = new Date(event.data_ora);
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

  const luogoFormatted = event.luogo && event.luogo.trim() !== "" ? event.luogo.trim() : "Sede JEMORE";

  const origin = typeof window !== "undefined" ? window.location.origin : "https://presente.jemore.it";
  const formUrl = event.form_slug
    ? `${origin}/partecipazione/${event.form_slug}`
    : `${origin}/partecipazione/${event.id}`;

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

  const handleWhatsAppShare = () => {
    const encoded = encodeURIComponent(messageText);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                Template Convocazione Assemblea
              </h3>
              <p className="text-xs text-zinc-400">
                Evento creato con successo. Seleziona la tipologia e copia il messaggio pronto.
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
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-5 bg-zinc-950 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
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
              onClick={handleWhatsAppShare}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              Invia su WhatsApp
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                if (onProceedToDashboard) {
                  onProceedToDashboard(event.id);
                } else {
                  window.location.href = `/dashboard?event_id=${event.id}`;
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

