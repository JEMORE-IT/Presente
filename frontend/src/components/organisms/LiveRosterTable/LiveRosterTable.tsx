import React, { useState, useEffect } from "react";
import { LiveRosterTableProps, RosterMember } from "./LiveRosterTable.types";
import { StatusBadge } from "../../atoms/StatusBadge/StatusBadge";
import { Search, AlertTriangle, UserCheck, Wifi, ShieldCheck, Loader2, UserMinus, X } from "lucide-react";
import { Select } from "../../atoms/Select/Select";
import { API_BASE_URL } from "@/lib/api";

export const LiveRosterTable: React.FC<LiveRosterTableProps> = ({
  members,
  onManualCheckin,
  isLoading = false,
  isOnlineEvent = false,
  eventType,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedArea, setSelectedArea] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  
  // Delega Modal State
  const [showDelegaModal, setShowDelegaModal] = useState(false);
  const [delegaTargetId, setDelegaTargetId] = useState<number | null>(null);
  const [delegaA, setDelegaA] = useState<string>("");
  const [sociOptions, setSociOptions] = useState<{value: string, label: string}[]>([]);

  useEffect(() => {
    // Fetch soci list when component mounts (or when modal is opened, but here is fine for now)
    async function fetchSoci() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/soci`);
        if (res.ok) {
          const data = await res.json();
          setSociOptions(data.map((s: any) => ({
            value: s.nome,
            label: `${s.nome} (${s.email})`
          })));
        }
      } catch (err) {
        console.error("Failed to fetch soci for delega dropdown", err);
      }
    }
    fetchSoci();
  }, []);

  // Get unique areas for filter dropdown
  const areas = Array.from(new Set(members.map((m) => m.area_lavoro).filter(Boolean)));

  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      member.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.ruolo.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesArea = selectedArea === "ALL" || member.area_lavoro === selectedArea;

    const currentStatus = member.attendance_status || "ASSENTE";
    const matchesStatus =
      selectedStatus === "ALL" ||
      (selectedStatus === "ASSENTE_GIUSTIFICATO" &&
        (currentStatus === "ASSENTE_GIUSTIFICATO" || currentStatus === "GIUSTIFICATO")) ||
      currentStatus === selectedStatus;

    return matchesSearch && matchesArea && matchesStatus;
  });

  const handleAction = async (
    socioId: number,
    action: "IN_PRESENZA" | "ONLINE" | "GIUSTIFICATO" | "ASSENTE",
    delega_a?: string
  ) => {
    if (!onManualCheckin) return;
    await onManualCheckin(socioId, action, delega_a);
  };

  const handleGiustifica = (socioId: number) => {
    setDelegaTargetId(socioId);
    setDelegaA("");
    setShowDelegaModal(true);
  };

  const confirmGiustifica = async () => {
    if (delegaTargetId !== null) {
      await handleAction(delegaTargetId, "GIUSTIFICATO", delegaA || undefined);
      setShowDelegaModal(false);
      setDelegaTargetId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
      {/* Table Filters */}
      <div className="p-5 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-72">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Cerca soci (nome, ruolo, email)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="flex w-full md:w-auto gap-3">
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="w-full md:w-48 px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="ALL">Tutte le Aree</option>
            {areas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full md:w-48 px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="ALL">Tutti gli Stati</option>
            <option value="IN_PRESENZA">In Presenza</option>
            <option value="ONLINE">Online</option>
            <option value="ASSENTE_GIUSTIFICATO">Giustificati</option>
            <option value="PRE_REGISTRATO">Pre-Registrati</option>
            <option value="ASSENTE">Assenti</option>
          </select>
        </div>
      </div>

      {/* Roster Grid */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-zinc-800 text-left text-sm">
          <thead className="bg-gray-50 dark:bg-zinc-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3 font-semibold">Socio</th>
              <th className="px-6 py-3 font-semibold">Ruolo / Area</th>
              <th className="px-6 py-3 font-semibold">Stato presenze</th>
              {isOnlineEvent && <th className="px-6 py-3 font-semibold">Durata</th>}
              {eventType === "ASSEMBLEA" && <th className="px-6 py-3 font-semibold">Iscrizione</th>}
              {onManualCheckin && <th className="px-6 py-3 font-semibold text-right">Azioni Rapide</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" /> Caricamento in corso...
                  </div>
                </td>
              </tr>
            ) : filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-500">
                  Nessun socio trovato.
                </td>
              </tr>
            ) : (
              filteredMembers.map((member) => {
                const currentStatus = member.attendance_status || "ASSENTE";
                const isPresent =
                  currentStatus === "IN_PRESENZA" || currentStatus === "ONLINE";
                const isExcused =
                  currentStatus === "GIUSTIFICATO" || currentStatus === "ASSENTE_GIUSTIFICATO";
                const isCritical = member.is_critical_alert && currentStatus === "ASSENTE";

                const isPresentStatus = (s?: string) => s === "IN_PRESENZA" || s === "ONLINE";
                const hasDelega = Boolean(member.delega_a && member.delega_a.trim() !== "" && member.delega_a !== "null");
                let isDelegatePresent = true;
                if (hasDelega) {
                  const target = member.delega_a!.trim().toLowerCase();
                  const delegateObj = members.find(
                    (m) => m.nome.trim().toLowerCase() === target || m.email.trim().toLowerCase() === target
                  );
                  if (delegateObj) {
                    isDelegatePresent = isPresentStatus(delegateObj.attendance_status);
                  } else {
                    isDelegatePresent = member.is_delegate_present ?? false;
                  }
                }

                return (
                  <tr
                    key={member.socio_id}
                    className={`transition-colors ${
                      isPresent
                        ? "bg-green-50 dark:bg-green-900/10"
                        : isExcused
                        ? "bg-yellow-50 dark:bg-yellow-900/10"
                        : "hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                        <span>{member.nome}</span>
                        {hasDelega && !isDelegatePresent && (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shadow-xs animate-pulse shrink-0"
                            title={`Attenzione: il delegato (${member.delega_a}) non ha ancora effettuato il check-in`}
                          />
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {member.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-900 dark:text-white">{member.ruolo}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {member.area_lavoro}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={currentStatus as any} />
                        {hasDelega && (
                          <span className="inline-flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                            {!isDelegatePresent ? (
                              <span
                                className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0"
                                title={`Delegato (${member.delega_a}) assente`}
                              />
                            ) : (
                              <span
                                className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                                title={`Delegato (${member.delega_a}) presente`}
                              />
                            )}
                            Delega a: <span className="text-gray-700 dark:text-gray-300 font-semibold">{member.delega_a}</span>
                          </span>
                        )}
                      </div>
                    </td>
                    {isOnlineEvent && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        {member.durata_minuti !== undefined && member.durata_minuti > 0 ? (
                          <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                            {member.durata_minuti} min
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                    )}
                    {eventType === "ASSEMBLEA" && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        {member.registrato_il ? (
                          <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                            {new Date(member.registrato_il).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                    )}
                    {onManualCheckin && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* In Presenza button */}
                          <button
                            onClick={() => handleAction(member.socio_id, "IN_PRESENZA")}
                            disabled={currentStatus === "IN_PRESENZA"}
                            title="Segna in presenza"
                            className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-semibold transition-colors ${
                              currentStatus === "IN_PRESENZA"
                                ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/50 cursor-default"
                                : "bg-white dark:bg-zinc-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-zinc-700 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400 hover:border-green-300 dark:hover:border-green-800/50"
                            } disabled:opacity-60`}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            Presenza
                          </button>

                          {/* Online button */}
                          <button
                            onClick={() => handleAction(member.socio_id, "ONLINE")}
                            disabled={currentStatus === "ONLINE"}
                            title="Segna online"
                            className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-semibold transition-colors ${
                              currentStatus === "ONLINE"
                                ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/50 cursor-default"
                                : "bg-white dark:bg-zinc-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-zinc-700 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400 hover:border-green-300 dark:hover:border-green-800/50"
                            } disabled:opacity-60`}
                          >
                            <Wifi className="h-3.5 w-3.5" />
                            Online
                          </button>

                          {/* Giustifica button */}
                          <button
                            onClick={() => handleGiustifica(member.socio_id)}
                            disabled={isExcused}
                            title="Segna giustificato"
                            className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-semibold transition-colors ${
                              isExcused
                                ? "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800/50 cursor-default"
                                : "bg-white dark:bg-zinc-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-zinc-700 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 hover:text-yellow-600 dark:hover:text-yellow-400 hover:border-yellow-300 dark:hover:border-yellow-800/50"
                            } disabled:opacity-60`}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Giustifica
                          </button>

                          {/* Assente button */}
                          <button
                            onClick={() => handleAction(member.socio_id, "ASSENTE")}
                            disabled={currentStatus === "ASSENTE"}
                            title="Segna assente"
                            className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-semibold transition-colors ${
                              currentStatus === "ASSENTE"
                                ? "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/50 cursor-default"
                                : "bg-white dark:bg-zinc-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-zinc-700 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-800/50"
                            } disabled:opacity-60`}
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                            Assente
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="p-3 bg-gray-50 dark:bg-zinc-900/50 border-t border-gray-200 dark:border-zinc-800 text-xs text-gray-400 flex items-center justify-between">
        <span>Mostrati {filteredMembers.length} di {members.length} soci.</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800/50 rounded"></span>
            Presente
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-800/50 rounded"></span>
            Giustificato
          </span>
        </div>
      </div>

      {/* Delega Modal */}
      {showDelegaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-zinc-800 scale-in-center">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 flex justify-between items-center bg-blue-50 dark:bg-blue-900/20">
              <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                Registra Giustificazione / Delega
              </h3>
              <button 
                onClick={() => setShowDelegaModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-6 text-gray-700 dark:text-gray-300 space-y-4">
              <p className="text-sm">
                Seleziona il socio a cui assegnare la delega.
              </p>
              <Select 
                label="Socio Delegato"
                options={sociOptions}
                value={delegaA}
                onChange={(e) => setDelegaA(e.target.value)}
              />
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-zinc-800/50 border-t border-gray-200 dark:border-zinc-800 flex justify-end gap-3">
              <button
                onClick={() => setShowDelegaModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-800 dark:text-white rounded-full font-medium transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={confirmGiustifica}
                disabled={!delegaA}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-full font-medium transition-colors shadow-sm"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
