import React from "react";
import { StatusBadgeProps } from "./StatusBadge.types";

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const styles = {
    IN_PRESENZA: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/50",
    ONLINE: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/50",
    ASSENTE_GIUSTIFICATO: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800/50",
    GIUSTIFICATO: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800/50",
    PRE_REGISTRATO: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/50",
    ASSENTE: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/50",
  };

  const labels = {
    IN_PRESENZA: "In Presenza",
    ONLINE: "Online",
    ASSENTE_GIUSTIFICATO: "Delegato",
    GIUSTIFICATO: "Delegato",
    PRE_REGISTRATO: "Pre-Registrato",
    ASSENTE: "Assente",
  };

  const currentStyle = styles[status] || styles.ASSENTE;
  const currentLabel = labels[status] || labels.ASSENTE;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${currentStyle}`}>
      {currentLabel}
    </span>
  );
};
