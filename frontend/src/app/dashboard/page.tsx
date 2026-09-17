"use client";

import React, { useEffect, useState } from "react";
import { RosterMember } from "@/components/organisms/LiveRosterTable/LiveRosterTable.types";
import { LiveRosterTable } from "@/components/organisms/LiveRosterTable/LiveRosterTable";
import { KpiCard } from "@/components/molecules/KpiCard/KpiCard";
import { QrProjectorModal } from "@/components/organisms/QrProjectorModal/QrProjectorModal";
import { MinutesExportModal } from "@/components/organisms/MinutesExportModal/MinutesExportModal";
import { Users, UserCheck, Calendar, UserX, AlertCircle, QrCode, Upload, FileText, X, CheckCircle2 } from "lucide-react";
import { AssembleaAnnouncementModal } from "@/components/organisms/AssembleaAnnouncementModal/AssembleaAnnouncementModal";
import { API_BASE_URL } from "@/lib/api";

interface Evento {
  id: number;
  titolo: string;
  tipo: string;
  data_ora: string;
  modalita: string;
  soglia_consecutiva: number;
  is_attivo: boolean;
}

export default function Dashboard() {
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [events, setEvents] = useState<Evento[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);

  // Announcement state (Dichiarazione Inizio Assemblea)
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [announcedAt, setAnnouncedAt] = useState<string | null>(null);

  // Load any previously declared announcement for the selected event
  useEffect(() => {
    if (selectedEventId && typeof window !== "undefined") {
      const saved = localStorage.getItem(`assemblea_announcement_${selectedEventId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setAnnouncedAt(parsed.time || parsed.phrase || null);
        } catch {
          setAnnouncedAt(null);
        }
      } else {
        setAnnouncedAt(null);
      }
    }
  }, [selectedEventId]);

  const handleDeclareAssembly = (time: string) => {
    setAnnouncedAt(time);
    if (selectedEventId && typeof window !== "undefined") {
      localStorage.setItem(`assemblea_announcement_${selectedEventId}`, JSON.stringify({ time }));
    }
  };

  // Fetch events only (roster is fetched per event)
  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");

      // Fetch events
      const eventsRes = await fetch(`${API_BASE_URL}/api/events`);
      if (!eventsRes.ok) throw new Error("Errore nel recupero degli eventi");
      const eventsData = await eventsRes.json();
      setEvents(eventsData);

      // Default to the event specified in URL or the first active/latest event
      if (eventsData.length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const urlEventId = urlParams.get("event_id");
        if (urlEventId && eventsData.some((evt: any) => evt.id === Number(urlEventId))) {
          setSelectedEventId(Number(urlEventId));
        } else {
          // Find first active or just first event
          const activeEvt = eventsData.find((evt: any) => evt.is_attivo) || eventsData[0];
          setSelectedEventId(activeEvt.id);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError("Impossibile caricare i dati del server");
    } finally {
      setLoading(false);
    }
  };

  const fetchEventRoster = async (eventId: number) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/roster`);
      if (!res.ok) throw new Error("Errore nel recupero roster dell'evento");
      const data = await res.json();
      // Map "status" from API to "attendance_status" for the frontend
      const mappedRoster = data.roster.map((m: any) => ({
        ...m,
        attendance_status: m.status,
        attendance_modality: m.status,
      }));
      setMembers(mappedRoster);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      fetchEventRoster(selectedEventId);
    }
  }, [selectedEventId]);


  // Listen to custom window events for global Navbar actions
  useEffect(() => {
    const handleProiettaQr = () => {
      setIsQrOpen(true);
    };

    window.addEventListener("trigger-proietta-qr", handleProiettaQr);

    return () => {
      window.removeEventListener("trigger-proietta-qr", handleProiettaQr);
    };
  }, []);

  // Handle URL query parameter triggers on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    let shouldCleanUrl = false;
    if (urlParams.get("project") === "true") {
      setIsQrOpen(true);
      shouldCleanUrl = true;
    }
    if (shouldCleanUrl) {
      const eventId = urlParams.get("event_id");
      const cleanUrl = window.location.pathname + (eventId ? `?event_id=${eventId}` : "");
      window.history.replaceState(null, "", cleanUrl);
    }
  }, []);

  // SSE subscription for live check-in events
  useEffect(() => {
    const sse = new EventSource(`${API_BASE_URL}/api/live`);

    sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const sseEventType = payload.event;
        const sseData = payload.data;

        if (!sseData) return;

        // If the check-in matches the currently selected event, update roster inline
        if (
          (sseEventType === "CHECKIN_UPDATED") &&
          selectedEventId &&
          sseData.event_id === selectedEventId &&
          sseData.email
        ) {
          const modalita = sseData.modalita || "IN_PRESENZA";
          setMembers((prevMembers) =>
            prevMembers.map((member) => {
              if (member.email.toLowerCase() === sseData.email.toLowerCase()) {
                return {
                  ...member,
                  attendance_status: modalita,
                  attendance_modality: modalita,
                  consecutive_absences: 0,
                  is_critical_alert: false,
                  delega_a: sseData.delega_a,
                };
              }
              return member;
            })
          );
        }

        // Re-fetch entire roster for ROSTER_UPDATED events (e.g. after import)
        if (sseEventType === "ROSTER_UPDATED") {
          if (selectedEventId) fetchEventRoster(selectedEventId);
        } else if (sseEventType === "EVENT_CREATED") {
          fetchData();
        }
      } catch (err) {
        console.error("Failed to parse SSE data:", err);
      }
    };

    sse.onerror = (err) => {
      console.warn("SSE connection error, closing or retrying...", err);
    };

    return () => {
      sse.close();
    };
  }, [selectedEventId]);

  // Handle Manual Check-In — optimistic update so status and KPIs update instantly
  const handleManualCheckin = async (
    socioId: number,
    status: "IN_PRESENZA" | "ONLINE" | "GIUSTIFICATO" | "PRE_REGISTRATO" | "ASSENTE",
    delega_a?: string
  ) => {
    if (!selectedEventId) {
      alert("Seleziona prima un evento attivo per registrare presenze.");
      return;
    }

    // Optimistic update: change the member's status in local state immediately
    setMembers((prev) =>
      prev.map((m) => {
        if (m.socio_id !== socioId) return m;
        const isPresent = status === "IN_PRESENZA" || status === "ONLINE";
        const isExcused = status === "GIUSTIFICATO";
        // Present: streak resets to 0. Excused: streak decrements by 1 (min 0). Absent: unchanged.
        const newStreak = isPresent
          ? 0
          : isExcused
            ? Math.max(0, m.consecutive_absences - 1)
            : m.consecutive_absences;
        return {
          ...m,
          attendance_status: status,
          attendance_modality: status,
          delega_a: delega_a ?? m.delega_a,
          consecutive_absences: newStreak,
          is_critical_alert: newStreak > 0 && m.is_critical_alert,
        };
      })
    );

    try {
      const res = await fetch(`${API_BASE_URL}/api/checkin/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          socio_id: socioId,
          event_id: selectedEventId,
          modalita: status,
          delega_a: delega_a || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.status === "error") {
        throw new Error(data.message || data.detail || "Impossibile registrare la presenza manualmente");
      }

      // No full refetch needed — SSE will handle any sync for other connected clients
    } catch (err: any) {
      // Rollback: re-fetch to get the real state on error
      setCheckinError(err.message || "Errore durante la registrazione manuale");
      if (selectedEventId) {
        await fetchEventRoster(selectedEventId);
      }
    }
  };

  // Handle CSV Import
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEventId) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setError("");
      const res = await fetch(`${API_BASE_URL}/api/events/${selectedEventId}/import-pre-assembly`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Errore durante l'importazione");
      }

      alert("Importazione completata con successo!");
      await fetchEventRoster(selectedEventId);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Errore durante l'importazione");
    } finally {
      e.target.value = "";
    }
  };

  // Handle Teams CSV Import
  const handleTeamsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEventId) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setError("");
      const res = await fetch(`${API_BASE_URL}/api/events/${selectedEventId}/import-teams`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Errore durante l'importazione Teams");
      }

      alert("Importazione Teams completata con successo!");
      await fetchEventRoster(selectedEventId);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Errore durante l'importazione Teams");
    } finally {
      e.target.value = "";
    }
  };

  // Calculate KPIs dynamically
  const activeMembers = members.filter((m) => m.stato === "ATTIVO");

  const totalPreRegisteredCount = activeMembers.filter((m) => m.is_preregistrato).length;

  const preRegisteredCount = activeMembers.filter(
    (m) => m.attendance_status === "PRE_REGISTRATO"
  ).length;

  const presentInPersonCount = activeMembers.filter(
    (m) => m.attendance_status === "IN_PRESENZA"
  ).length;

  const presentOnlineCount = activeMembers.filter(
    (m) => m.attendance_status === "ONLINE"
  ).length;

  const excusedCount = activeMembers.filter(
    (m) => m.attendance_status === "ASSENTE_GIUSTIFICATO" || m.attendance_status === "GIUSTIFICATO"
  ).length;

  const absentCount = activeMembers.filter(
    (m) => m.attendance_status === "ASSENTE" || !m.attendance_status
  ).length;

  // Quorum calculation (50% + 1 of active members)
  // Quorum reaches 100% when reaching half the members + 1 (quorumTarget)
  // Quorum includes: in-presence, online, and absent/excused members who delegated (delega_a)
  const totalVotingMembers = activeMembers.length > 0 ? activeMembers.length : members.length;
  const quorumTarget = Math.floor(totalVotingMembers / 2) + 1;

  const validQuorumMembers = activeMembers.filter((m) => {
    const isPresent = m.attendance_status === "IN_PRESENZA" || m.attendance_status === "ONLINE";
    const hasValidDelega = Boolean(m.delega_a && m.delega_a.trim() !== "" && m.delega_a !== "null");
    return isPresent || hasValidDelega;
  });

  const currentQuorumCount = validQuorumMembers.length;
  const isQuorumReached = currentQuorumCount >= quorumTarget && totalVotingMembers > 0;
  const quorumProgressPct = quorumTarget > 0 ? Math.min(100, Math.round((currentQuorumCount / quorumTarget) * 100)) : 0;

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="flex flex-col min-h-screen">

      {/* Main Grid Layout */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {error && (
          <div className="p-4 bg-red-100 border border-red-200 text-red-700 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        {/* Declared Assembly Announcement Banner - Flat solid colors, no gradients */}
        {announcedAt && selectedEvent?.tipo === "ASSEMBLEA" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔨</span>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider bg-yellow-500 text-zinc-950 px-2.5 py-0.5 rounded-full">
                  Assemblea Iniziata
                </span>
                <span className="text-sm font-semibold text-white">
                  Apertura dichiarata alle ore <span className="text-yellow-500 font-bold">{announcedAt}</span>
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsAnnouncementModalOpen(true)}
              className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-lg transition-colors font-medium self-start sm:self-auto shrink-0 shadow-sm"
            >
              Modifica Orario
            </button>
          </div>
        )}

        {/* Selected Event details & Selection bar */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <span className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Evento Selezionato:
            </span>
            {events.length > 0 ? (
              <select
                value={selectedEventId || ""}
                onChange={(e) => setSelectedEventId(Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-300 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-950 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.titolo} ({evt.tipo} - {evt.modalita})
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-medium text-gray-400 dark:text-gray-500 italic">Nessun evento attivo. Creane uno per iniziare.</span>
            )}
          </div>

          {selectedEvent && (
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-gray-500 dark:text-gray-400">

              {selectedEvent.tipo === "ASSEMBLEA" ? (
                <div className="relative">
                  <button
                    onClick={() => setIsImportDropdownOpen(!isImportDropdownOpen)}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded-full border border-gray-300 dark:border-zinc-700 cursor-pointer font-sans text-sm font-semibold transition-colors shadow-sm"
                  >
                    <Upload className="h-4 w-4" />
                    Raccolta Dati
                  </button>
                  
                  {isImportDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-lg z-50 overflow-hidden">
                      <label className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors border-b border-gray-100 dark:border-zinc-800">
                        <Upload className="h-4 w-4 text-blue-500" />
                        Importa Forms (CSV)
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => {
                             setIsImportDropdownOpen(false);
                             handleCsvUpload(e);
                          }}
                        />
                      </label>
                      <button
                        onClick={() => {
                          setIsImportDropdownOpen(false);
                          const link = `${window.location.origin}/events/${selectedEvent.id}/partecipazione`;
                          navigator.clipboard.writeText(link);
                          alert("Link univoco per il modulo di partecipazione copiato negli appunti:\n" + link);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors text-left"
                      >
                        <FileText className="h-4 w-4 text-green-500" />
                        Copia Link (Form Interno)
                      </button>
                    </div>
                  )}
                </div>
              ) : selectedEvent.modalita === "ONLINE" || selectedEvent.modalita === "ONLINE_ONLY" ? (
                <label className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded-full border border-gray-300 dark:border-zinc-700 cursor-pointer font-sans text-sm font-semibold transition-colors shadow-sm">
                  <Upload className="h-4 w-4" />
                  Importa Teams (CSV)
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleTeamsUpload}
                  />
                </label>
              ) : (
                <button
                  onClick={() => {
                    const link = `${window.location.origin}/events/${selectedEvent.id}/partecipazione`;
                    navigator.clipboard.writeText(link);
                    alert("Link univoco per il modulo di partecipazione copiato negli appunti:\n" + link);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded-full border border-gray-300 dark:border-zinc-700 cursor-pointer font-sans text-sm font-semibold transition-colors shadow-sm"
                >
                  <Upload className="h-4 w-4" />
                  Crea Link (Form)
                </button>
              )}

              {/* Proietta QR — visible here, relative to the selected event */}
              <button
                onClick={() => setIsQrOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full border border-blue-600 cursor-pointer font-sans text-sm font-semibold transition-colors shadow-sm"
              >
                <QrCode className="h-4 w-4" />
                Proietta QR
              </button>

              {selectedEvent.tipo === "ASSEMBLEA" && (
                <button
                  onClick={() => setIsExportOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full border border-green-600 cursor-pointer font-sans text-sm font-semibold transition-colors shadow-sm"
                >
                  <FileText className="h-4 w-4" />
                  Esporta Verbale
                </button>
              )}

            </div>
          )}
        </div>

        {/* Assemblea Quorum Progress Bar */}
        {selectedEvent?.tipo === "ASSEMBLEA" && (
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
            {/* Header with status badge and button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-800/60 text-yellow-500">
                  <span className="text-2xl">🏛️</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                    Quorum Costitutivo Assemblea (50% + 1)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Soglia statutaria: <strong>{quorumTarget} soci</strong> su {totalVotingMembers} aventi diritto (presenti in presenza + online + deleghe).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
                {isQuorumReached ? (
                  <div className="px-3.5 py-1.5 rounded-full text-xs font-bold border bg-emerald-500/20 text-emerald-300 border-emerald-500/40 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>QUORUM RAGGIUNTO ({currentQuorumCount}/{quorumTarget})</span>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-zinc-300 font-mono px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-xl">
                    {currentQuorumCount} / {quorumTarget}
                  </div>
                )}

                <button
                  onClick={() => setIsAnnouncementModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-zinc-950 rounded-full text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>🔨</span>
                  <span>Dichiara Inizio</span>
                </button>
              </div>
            </div>

            {/* Progress Bar (reaches 100% at quorumTarget) */}
            <div className="pt-1">
              <div className="w-full h-4 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                <div
                  className="h-full bg-yellow-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${quorumProgressPct}%` }}
                />
              </div>
            </div>
          </section>
        )}

        {/* Real-time KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard
            title="Prenotati"
            value={loading ? "-" : preRegisteredCount}
            icon={<Users className="h-5 w-5" />}
            variant="default"
            description={`su ${totalPreRegisteredCount} prenotati totali`}
          />
          <KpiCard
            title="In Presenza"
            value={loading ? "-" : presentInPersonCount}
            icon={<UserCheck className="h-5 w-5 text-green-500" />}
            variant="success"
          />
          <KpiCard
            title="Online"
            value={loading ? "-" : presentOnlineCount}
            icon={<UserCheck className="h-5 w-5 text-green-500" />}
            variant="success"
          />
          <KpiCard
            title="Giustificati"
            value={loading ? "-" : excusedCount}
            icon={<Calendar className="h-5 w-5 text-yellow-500" />}
            variant="warning"
          />
          <KpiCard
            title="Assenti"
            value={loading ? "-" : absentCount}
            icon={<UserX className="h-5 w-5 text-red-500" />}
            variant="danger"
          />
        </section>

        {/* Live Roster Table */}
        <section>
          <LiveRosterTable
            members={members}
            onManualCheckin={handleManualCheckin}
            isLoading={loading}
            isOnlineEvent={selectedEvent?.modalita === "ONLINE" || selectedEvent?.modalita === "ONLINE_ONLY"}
            eventType={selectedEvent?.tipo}
          />
        </section>
      </main>

      {/* QR Projector Modal */}
      {selectedEvent && (
        <QrProjectorModal
          isOpen={isQrOpen}
          onClose={() => setIsQrOpen(false)}
          eventId={selectedEventId}
          eventTitle={selectedEvent.titolo}
        />
      )}

      {/* Minutes Export Modal */}
      {selectedEvent && selectedEventId && (
        <MinutesExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          eventId={selectedEventId}
          eventTitle={selectedEvent.titolo}
        />
      )}

      {/* Assemblea Announcement Modal */}
      {selectedEvent && (
        <AssembleaAnnouncementModal
          isOpen={isAnnouncementModalOpen}
          onClose={() => setIsAnnouncementModalOpen(false)}
          eventTitle={selectedEvent.titolo}
          onDeclare={handleDeclareAssembly}
        />
      )}

      {/* Error Modal */}
      {checkinError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-zinc-800">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 flex justify-between items-center bg-red-50 dark:bg-red-900/20">
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Errore Operazione
              </h3>
              <button
                onClick={() => setCheckinError(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 text-gray-700 dark:text-gray-300">
              {checkinError}
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-zinc-800/50 border-t border-gray-200 dark:border-zinc-800 flex justify-end">
              <button
                onClick={() => setCheckinError(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-800 dark:text-white rounded-full font-medium transition-colors"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
