"use client";

import React, { useState } from "react";
import { X, FileText, Download, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/atoms/Button/Button";
import { API_BASE_URL } from "@/lib/api";
import { MinutesExportModalProps } from "./MinutesExportModal.types";

export const MinutesExportModal: React.FC<MinutesExportModalProps> = ({
  isOpen,
  onClose,
  eventId,
  eventTitle,
}) => {
  const { data: session } = useSession();
  const [isExporting, setIsExporting] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExport = async (format: "pdf" | "csv") => {
    setIsExporting(format);
    try {
      let timeParams = "";
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(`assemblea_announcement_${eventId}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.time) {
              timeParams += `&ora_inizio=${encodeURIComponent(parsed.time)}`;
            }
            if (parsed.endTime) {
              timeParams += `&ora_fine=${encodeURIComponent(parsed.endTime)}`;
            }
          } catch {}
        }
      }

      const downloadUrl = `${API_BASE_URL}/api/events/${eventId}/export-minutes/${format}?quorum_pct=0.5${timeParams}`;
      
      const headers: Record<string, string> = {};
      const token = (session as any)?.idToken || (session as any)?.accessToken || session?.user?.email || "";
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(downloadUrl, {
        headers,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Errore durante il download del verbale (${res.status})`);
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      const cleanTitle = eventTitle.replace(/[^a-zA-Z0-9_-]/g, "_");
      link.download = `verbale_${cleanTitle}_${eventId}.${format}`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(link);
    } catch (err: any) {
      alert(err.message || "Errore durante l'esportazione");
    } finally {
      setIsExporting(null);
    }
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
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Evento Selezionato
            </p>
            <p className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
              {eventTitle}
            </p>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400">
            Scegli il formato in cui desideri scaricare il verbale ufficiale contenente il calcolo presenze, deleghe e quorum:
          </p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => handleExport("pdf")}
              disabled={isExporting !== null}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100/70 dark:hover:bg-red-900/30 transition-all text-red-700 dark:text-red-300 font-semibold text-sm group disabled:opacity-50"
            >
              {isExporting === "pdf" ? (
                <Loader2 className="h-7 w-7 animate-spin text-red-600" />
              ) : (
                <FileText className="h-7 w-7 text-red-600 group-hover:scale-110 transition-transform" />
              )}
              <span>Documento PDF</span>
            </button>

            <button
              onClick={() => handleExport("csv")}
              disabled={isExporting !== null}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/30 transition-all text-emerald-700 dark:text-emerald-300 font-semibold text-sm group disabled:opacity-50"
            >
              {isExporting === "csv" ? (
                <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
              ) : (
                <Download className="h-7 w-7 text-emerald-600 group-hover:scale-110 transition-transform" />
              )}
              <span>Foglio CSV</span>
            </button>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-zinc-800 pt-4">
          <Button variant="secondary" onClick={onClose} className="text-sm">
            Chiudi
          </Button>
        </div>
      </div>
    </div>
  );
};
