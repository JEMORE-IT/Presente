"use client";

import React, { useState } from "react";
import { X, FileText, Download } from "lucide-react";
import { Button } from "@/components/atoms/Button/Button";
import { API_BASE_URL } from "@/lib/api";
import { MinutesExportModalProps } from "./MinutesExportModal.types";

export const MinutesExportModal: React.FC<MinutesExportModalProps> = ({
  isOpen,
  onClose,
  eventId,
  eventTitle,
}) => {
  const [quorumPct, setQuorumPct] = useState<number>(50);

  if (!isOpen) return null;

  const handleExport = (format: "pdf" | "csv") => {
    const quorumValue = quorumPct / 100;
    const downloadUrl = `${API_BASE_URL}/api/events/${eventId}/export-minutes/${format}?quorum_pct=${quorumValue}`;
    // Trigger download in a new tab or iframe
    window.open(downloadUrl, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl max-w-md w-full p-6 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            <h3 className="text-lg font-bold text-[#1f295c] dark:text-white">
              Esporta Verbale di Presenza
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Evento:
            </p>
            <p className="text-base font-bold text-gray-900 dark:text-white">
              {eventTitle}
            </p>
          </div>

          <div>
            <label
              htmlFor="quorum-pct"
              className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
            >
              Soglia Quorum (%)
            </label>
            <div className="relative rounded-md shadow-sm">
              <input
                type="number"
                name="quorum-pct"
                id="quorum-pct"
                min="1"
                max="100"
                value={quorumPct}
                onChange={(e) => setQuorumPct(Number(e.target.value))}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-500 dark:text-gray-400 sm:text-sm font-bold">%</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Default 50%. Definisce la percentuale minima di membri attivi necessaria per validare l'assemblea.
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-zinc-800 pt-4">
          <Button variant="secondary" onClick={onClose} className="text-sm">
            Annulla
          </Button>
          <Button
            variant="primary"
            onClick={() => handleExport("csv")}
            className="gap-2 text-sm"
          >
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button
            variant="success"
            onClick={() => handleExport("pdf")}
            className="gap-2 text-sm bg-green-600 hover:bg-green-700 text-white"
          >
            <Download className="h-4 w-4" /> PDF Verbale
          </Button>
        </div>
      </div>
    </div>
  );
};
