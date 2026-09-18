"use client";

import React, { useEffect, useState } from "react";
import { RosterMember } from "@/components/organisms/LiveRosterTable/LiveRosterTable.types";
import { LiveRosterTable } from "@/components/organisms/LiveRosterTable/LiveRosterTable";
import { KpiCard } from "@/components/molecules/KpiCard/KpiCard";
import { QrProjectorModal } from "@/components/organisms/QrProjectorModal/QrProjectorModal";
import { MinutesExportModal } from "@/components/organisms/MinutesExportModal/MinutesExportModal";
import { Users, UserCheck, Calendar, UserX, AlertCircle, QrCode, Upload, FileText, X, CheckCircle2, ChevronDown } from "lucide-react";
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

  // Announcement state (Dichiarazione Inizio & Fine Assemblea)
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [announcementModalType, setAnnouncementModalType] = useState<"start" | "end">("start");
  const [announcedAt, setAnnouncedAt] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [isQuorumOpen, setIsQuorumOpen] = useState(false);

  // Load any previously declared announcements for the selected event
  useEffect(() => {
    if (selectedEventId && typeof window !== "undefined") {
      const saved = localStorage.getItem(`assemblea_announcement_${selectedEventId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setAnnouncedAt(parsed.time || parsed.phrase || null);
          setEndedAt(parsed.endTime || null);
        } catch {
          setAnnouncedAt(null);
          setEndedAt(null);
        }
      } else {
        setAnnouncedAt(null);
        setEndedAt(null);
      }
    }
  }, [selectedEventId]);

  const handleDeclareAssembly = () => {
    const timeStr = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    setAnnouncedAt(timeStr);
    setAnnouncementModalType("start");
    if (selectedEventId && typeof window !== "undefined") {
      const saved = localStorage.getItem(`assemblea_announcement_${selectedEventId}`);
      let existingData = {};
      try {
        if (saved) existingData = JSON.parse(saved);
      } catch {}
      localStorage.setItem(
        `assemblea_announcement_${selectedEventId}`,
        JSON.stringify({ ...existingData, time: timeStr })
      );
    }
    setIsAnnouncementModalOpen(true);
  };

  const handleDeclareAssemblyEnd = () => {
    const timeStr = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    setEndedAt(timeStr);
    setAnnouncementModalType("end");
    if (selectedEventId && typeof window !== "undefined") {
      const saved = localStorage.getItem(`assemblea_announcement_${selectedEventId}`);
      let existingData = {};
      try {
        if (saved) existingData = JSON.parse(saved);
      } catch {}
      localStorage.setItem(
        `assemblea_announcement_${selectedEventId}`,
        JSON.stringify({ ...existingData, endTime: timeStr })
      );
    }
    setIsAnnouncementModalOpen(true);
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
  // Quorum count is formed by: pre-registered / present members (from Form / CSV) + absent members with delegation
  const totalVotingMembers = activeMembers.length > 0 ? activeMembers.length : members.length;
  const quorumTarget = Math.floor(totalVotingMembers / 2) + 1;

  const validQuorumMembers = activeMembers.filter((m) => {
    const isPreregOrPresent =
      Boolean(m.is_preregistrato) ||
      m.attendance_status === "PRE_REGISTRATO" ||
      m.attendance_status === "IN_PRESENZA" ||
      m.attendance_status === "ONLINE";
    const hasValidDelega = Boolean(m.delega_a && m.delega_a.trim() !== "" && m.delega_a !== "null");
    return isPreregOrPresent || hasValidDelega;
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

        {/* Unified Event & Assembly Dashboard Header */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm space-y-5">
          {/* Row 1: Event Selector & Action Buttons */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Evento Selezionato:
              </span>
              {events.length > 0 ? (
                <select
                  value={selectedEventId || ""}
                  onChange={(e) => setSelectedEventId(Number(e.target.value))}
                  className="px-3 py-1.5 border border-zinc-700 rounded-xl bg-zinc-950 text-sm font-semibold text-white focus:outline-none focus:ring-1 focus:ring-yellow-500"
                >
                  {events.map((evt) => (
                    <option key={evt.id} value={evt.id}>
                      {evt.titolo} ({evt.tipo} - {evt.modalita})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm font-medium text-zinc-500 italic">
                  Nessun evento attivo. Creane uno per iniziare.
                </span>
              )}
            </div>

            {selectedEvent && (
              <div className="flex flex-wrap items-center gap-2.5">
                {selectedEvent.tipo === "ASSEMBLEA" ? (
                  <div className="relative">
                    <button
                      onClick={() => setIsImportDropdownOpen(!isImportDropdownOpen)}
                      className="flex items-center gap-2 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full border border-zinc-700 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Raccolta Dati
                    </button>

                    {isImportDropdownOpen && (
                      <div className="absolute top-full right-0 sm:left-0 mt-2 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden">
                        <label className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 cursor-pointer text-xs font-medium text-zinc-300 transition-colors border-b border-zinc-800">
                          <Upload className="h-4 w-4 text-blue-400" />
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
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 cursor-pointer text-xs font-medium text-zinc-300 transition-colors text-left"
                        >
                          <FileText className="h-4 w-4 text-green-400" />
                          Copia Link (Form Interno)
                        </button>
                      </div>
                    )}
                  </div>
                ) : selectedEvent.modalita === "ONLINE" || selectedEvent.modalita === "ONLINE_ONLY" ? (
                  <label className="flex items-center gap-2 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full border border-zinc-700 text-xs font-semibold cursor-pointer transition-colors">
                    <Upload className="h-3.5 w-3.5" />
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
                    className="flex items-center gap-2 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full border border-zinc-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Crea Link (Form)
                  </button>
                )}

                {/* Proietta QR */}
                <button
                  onClick={() => setIsQrOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  Proietta QR
                </button>

                {selectedEvent.tipo === "ASSEMBLEA" && (
                  <button
                    onClick={() => setIsExportOpen(true)}
                    className="flex items-center gap-2 px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Esporta Verbale
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Row 2: Assembly Quorum Dropdown (collapsible to declutter dashboard) */}
          {selectedEvent?.tipo === "ASSEMBLEA" && (
            <div className="pt-3 border-t border-zinc-800">
              {/* Dropdown Toggle Header */}
              <button
                type="button"
                onClick={() => setIsQuorumOpen((prev) => !prev)}
                className="w-full flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-zinc-800/40 hover:bg-zinc-800/70 border border-zinc-800 transition-all text-left cursor-pointer group"
                aria-expanded={isQuorumOpen}
              >
                <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                  <div className="p-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-yellow-500 shrink-0">
                    <span className="text-base">🏛️</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold text-white tracking-tight">
                      Quorum Assemblea
                    </span>
            
                  </div>

      
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 group-hover:text-zinc-200 shrink-0">
                  <span className="hidden sm:inline">{isQuorumOpen ? "Nascondi Quorum" : "Dettagli Quorum"}</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      isQuorumOpen ? "rotate-180 text-yellow-400" : ""
                    }`}
                  />
                </div>
              </button>

              {/* Collapsible Dropdown Content */}
              {isQuorumOpen && (
                <div className="mt-3 p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                      Quorum Costitutivo Assemblea: (50% + 1)
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1">
                        Soglia statutaria: <strong className="text-zinc-200">{quorumTarget} soci</strong> su {totalVotingMembers} (preregistrati + deleghe).
                      </p>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap md:justify-end">
                      {/* Numeri di votanti grandi con focus visivo */}
                      {isQuorumReached ? (
                        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl border bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm font-mono">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-sans">
                              Quorum Raggiunto
                            </span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl sm:text-3xl font-black text-emerald-300 leading-none">
                                {currentQuorumCount}
                              </span>
                              <span className="text-emerald-500/70 font-bold text-lg leading-none">/</span>
                              <span className="text-emerald-400 font-bold text-lg leading-none">
                                {quorumTarget}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3.5 py-2 bg-zinc-800/90 border border-zinc-700 rounded-xl font-mono shadow-sm">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-sans">
                              Votanti Presenti
                            </span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl sm:text-3xl font-black text-yellow-400 leading-none">
                                {currentQuorumCount}
                              </span>
                              <span className="text-zinc-500 font-bold text-lg leading-none">/</span>
                              <span className="text-lg sm:text-xl text-zinc-300 font-bold leading-none">
                                {quorumTarget}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bottoni: Inizio e Fine Assemblea */}
                      <div className="flex flex-col gap-2">
                        {!announcedAt ? (
                          <button
                            type="button"
                            onClick={handleDeclareAssembly}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-zinc-950 rounded-full text-sm font-bold transition-colors cursor-pointer shadow-sm"
                          >
                            <span>🔨</span>
                            <span>Dichiara Inizio</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setAnnouncementModalType("start");
                              setIsAnnouncementModalOpen(true);
                            }}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-zinc-950 rounded-full text-sm font-bold transition-colors cursor-pointer shadow-sm"
                          >
                            <span>🔨</span>
                            <span>Assemblea iniziata alle {announcedAt}</span>
                          </button>
                        )}

                        {announcedAt && (
                          !endedAt ? (
                            <button
                              type="button"
                              onClick={handleDeclareAssemblyEnd}
                              className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-full text-sm font-bold transition-colors cursor-pointer shadow-sm"
                            >
                              <span>🏁</span>
                              <span>Dichiara Fine</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setAnnouncementModalType("end");
                                setIsAnnouncementModalOpen(true);
                              }}
                              className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-full text-sm font-bold transition-colors cursor-pointer shadow-sm"
                            >
                              <span>🏁</span>
                              <span>Assemblea conclusa alle {endedAt}</span>
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar (reaches 100% at quorumTarget) */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center text-xs font-medium text-zinc-400">
                      <span>Avanzamento Quorum</span>
                      <span className="text-yellow-400 font-mono font-bold">{quorumProgressPct}%</span>
                    </div>
                    <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                      <div
                        className="h-full bg-yellow-500 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${quorumProgressPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

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
          type={announcementModalType}
          announcedTime={announcementModalType === "end" ? endedAt : announcedAt}
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
