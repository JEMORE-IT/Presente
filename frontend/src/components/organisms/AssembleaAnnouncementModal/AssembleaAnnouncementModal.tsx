"use client";

import React, { useState } from "react";
import { X, Volume2, VolumeX, Sparkles, CheckCircle, AlertTriangle, MessageSquare } from "lucide-react";
import { Button } from "@/components/atoms/Button/Button";
import { AssembleaAnnouncementModalProps } from "./AssembleaAnnouncementModal.types";

export const AssembleaAnnouncementModal: React.FC<AssembleaAnnouncementModalProps> = ({
  isOpen,
  onClose,
  eventTitle,
  currentCount,
  quorumNeeded,
  isQuorumReached,
  onDeclare,
}) => {
  const presetGags = [
    {
      id: "istituzionale",
      title: "🏛️ Istituzionale",
      text: `Accertata la presenza del numero legale con ${currentCount} voti validi tra presenti e deleghe, dichiaro formalmente aperta l'Assemblea Generale dei Soci JEMORE.`,
    },
    {
      id: "classica",
      title: "🔨 Classica",
      text: "Dichiaro ufficialmente aperta l'Assemblea Generale dei Soci JEMORE! Buon lavoro a tutti.",
    },
    {
      id: "pizza",
      title: "🍕 Gag Pizza",
      text: "Silenzio in aula! Chi parla a sproposito offre la pizza a tutto il Board. Dichiaro aperta l'assemblea!",
    },
    {
      id: "epica",
      title: "⚔️ Epica",
      text: "Habemus Quorum! Che i giochi abbiano inizio. Dichiaro aperta la seduta!",
    },
    {
      id: "tech",
      title: "🚀 Tech & Dev",
      text: "Tutti i sistemi sono operativi, quorum verificato. Deploy riuscito: dichiaro aperta la seduta!",
    },
    {
      id: "caffe",
      title: "☕ Pausa Caffè",
      text: "Dichiaro aperta l'Assemblea dei Soci! Chi ha portato i pasticcini?",
    },
  ];

  const [selectedPhrase, setSelectedPhrase] = useState(presetGags[0].text);
  const [enableVoice, setEnableVoice] = useState(true);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (enableVoice && typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(selectedPhrase);
        utterance.lang = "it-IT";
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("Speech synthesis non disponibile:", err);
      }
    }
    onDeclare(selectedPhrase);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 rounded-xl">
              <span className="text-xl">🔨</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Dichiara Inizio Assemblea
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {eventTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quorum status alert */}
        <div className="mb-4">
          {isQuorumReached ? (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                <strong>Quorum raggiunto!</strong> {currentCount} voti validi su {quorumNeeded} minimi necessari.
              </span>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300 font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Attenzione:</strong> Il quorum (50% + 1) non è ancora stato raggiunto ({currentCount}/{quorumNeeded}). Puoi comunque procedere se lo desideri.
              </span>
            </div>
          )}
        </div>

        {/* Gag / Phrase Selection */}
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Scegli la frase o gag di apertura:
          </label>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {presetGags.map((gag) => {
              const isSelected = selectedPhrase === gag.text;
              return (
                <button
                  key={gag.id}
                  type="button"
                  onClick={() => setSelectedPhrase(gag.text)}
                  className={`px-3 py-2 text-xs font-semibold rounded-xl border text-left transition-all ${
                    isSelected
                      ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20"
                      : "bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-zinc-700 hover:border-blue-400"
                  }`}
                >
                  {gag.title}
                </button>
              );
            })}
          </div>

          {/* Textarea for custom edit */}
          <div className="pt-2">
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1 mb-1">
              <MessageSquare className="h-3.5 w-3.5" /> Modifica il testo personalizzato:
            </label>
            <textarea
              rows={3}
              value={selectedPhrase}
              onChange={(e) => setSelectedPhrase(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Scrivi qui la tua frase di apertura..."
            />
          </div>

          {/* Speech synthesis toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl border border-gray-200 dark:border-zinc-800 text-xs">
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              {enableVoice ? (
                <Volume2 className="h-4 w-4 text-blue-500" />
              ) : (
                <VolumeX className="h-4 w-4 text-gray-400" />
              )}
              <span className="font-medium">Riproduci sintesi vocale (Audio altoparlanti)</span>
            </div>
            <input
              type="checkbox"
              checked={enableVoice}
              onChange={(e) => setEnableVoice(e.target.checked)}
              className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-zinc-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-5 border-t border-gray-100 dark:border-zinc-800 mt-5">
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
            className="text-xs px-4 py-2"
          >
            Annulla
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleConfirm}
            className="text-xs px-5 py-2 bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white font-bold border-0 shadow-lg shadow-emerald-500/20 flex items-center gap-2"
          >
            <span>Dichiara Inizio</span>
            <span>🔨</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
