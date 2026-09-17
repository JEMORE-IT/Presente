"use client";

import React, { useState } from "react";
import { X, Clock } from "lucide-react";
import { AssembleaAnnouncementModalProps } from "./AssembleaAnnouncementModal.types";

export const AssembleaAnnouncementModal: React.FC<AssembleaAnnouncementModalProps> = ({
  isOpen,
  onClose,
  eventTitle,
  onDeclare,
}) => {
  const getInitialTime = () => {
    const now = new Date();
    return now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  };

  const [openingTime, setOpeningTime] = useState(getInitialTime);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onDeclare(openingTime);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog - Flat colors, no gradients */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-yellow-500/10 text-yellow-500 rounded-xl">
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Apertura Assemblea
              </h3>
              <p className="text-xs text-zinc-400 truncate max-w-[200px]">
                {eventTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
              Orario di Apertura:
            </label>
            <input
              type="time"
              value={openingTime}
              onChange={(e) => setOpeningTime(e.target.value)}
              className="w-full px-4 py-2.5 text-lg font-bold rounded-xl border border-zinc-700 bg-zinc-950 text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 text-center"
            />
          </div>
          <p className="text-xs text-zinc-400">
            L'orario verrà registrato per la verbalizzazione dell'inizio dell'assemblea.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-5 border-t border-zinc-800 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-yellow-500 hover:bg-yellow-400 text-zinc-950 transition-colors"
          >
            Conferma Orario
          </button>
        </div>
      </div>
    </div>
  );
};
