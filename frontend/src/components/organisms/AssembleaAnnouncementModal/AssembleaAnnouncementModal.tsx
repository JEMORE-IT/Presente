"use client";

import React from "react";
import { X } from "lucide-react";
import { AssembleaAnnouncementModalProps } from "./AssembleaAnnouncementModal.types";

export const AssembleaAnnouncementModal: React.FC<AssembleaAnnouncementModalProps> = ({
  isOpen,
  onClose,
  eventTitle,
  announcedTime,
}) => {
  if (!isOpen) return null;

  const displayTime =
    announcedTime ||
    new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

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
              <span className="text-xl">🔨</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Inizio Assemblea
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
        <div className="py-4 text-center space-y-3">
          <p className="text-sm font-medium text-zinc-300">
            Assemblea iniziata alle
          </p>
          <div className="text-3xl sm:text-4xl font-black text-yellow-400 font-mono tracking-wider py-3 px-6 bg-zinc-950 border border-zinc-800 rounded-2xl inline-block shadow-inner">
            {displayTime}
          </div>
        </div>

        {/* Footer Action */}
        <div className="pt-4 border-t border-zinc-800 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 text-xs font-bold rounded-xl bg-yellow-500 hover:bg-yellow-400 text-zinc-950 transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
