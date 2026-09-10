import { formatInterventionStatus, formatInterventionTime, formatInterventionType } from "@/lib/interventions";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { InterventionDto, ReportDto } from "@/types/dtos";
import type { ReactNode } from "react";

/**
 * Colonne delle due tabelle della scheda collaboratore.
 *
 * Stanno in un file a parte, come per gli elenchi principali, perché `EntityTable` misura e
 * ricorda le larghezze per `tableKey` e chiave di colonna: definirle dentro la pagina
 * significherebbe ricrearne l'array a ogni render, e con esso l'elenco delle chiavi da cui
 * dipende la misurazione.
 */
export type CollaboratorReportColumn = {
    key: keyof ReportDto | "actions";
    header: string;
    className?: string;
    render: (row: ReportDto) => ReactNode;
};

export type CollaboratorInterventionColumn = {
    key: keyof InterventionDto | "actions" | "schedule";
    header: string;
    className?: string;
    render: (row: InterventionDto) => ReactNode;
};

export const collaboratorReportColumns: CollaboratorReportColumn[] = [
    {
        key: "id",
        header: "ID",
        render: (row) => row.id,
    },
    {
        key: "customer",
        header: "Cliente",
        render: (row) => row.customer,
    },
    {
        key: "customerPhone",
        header: "Telefono",
        render: (row) => row.customerPhone ?? "-",
    },
    {
        key: "device",
        header: "Dispositivo",
        render: (row) => row.device,
    },
    {
        key: "issue",
        header: "Difetto",
        render: (row) => row.issue,
    },
    {
        // Lo stato in parole e non solo nel colore della riga: stessa scelta dell'elenco
        // report, per chi non distingue verde e rosso.
        key: "closed",
        header: "Stato",
        render: (row) => (row.closed ? "Chiuso" : "Aperto"),
    },
    {
        key: "createdAt",
        header: "Creato il",
        render: (row) => formatDateTime(row.createdAt),
    },
    {
        key: "actions",
        header: "Azioni",
        className: "text-right",
        render: () => null,
    },
];

export const collaboratorInterventionColumns: CollaboratorInterventionColumn[] = [
    {
        key: "id",
        header: "ID",
        render: (row) => row.id,
    },
    {
        key: "customer",
        header: "Cliente",
        render: (row) => row.customer,
    },
    {
        key: "customerPhone",
        header: "Telefono",
        render: (row) => row.customerPhone ?? "-",
    },
    {
        key: "type",
        header: "Tipo",
        render: (row) => formatInterventionType(row.type),
    },
    {
        key: "schedule",
        header: "Data/Orario",
        render: (row) => {
            if (!row.interventionDate) {
                return "-";
            }

            if (!row.startTime || !row.endTime) {
                return formatDate(row.interventionDate);
            }

            return `${formatDate(row.interventionDate)} ${formatInterventionTime(row.startTime)}-${formatInterventionTime(row.endTime)}`;
        },
    },
    {
        key: "status",
        header: "Stato",
        render: (row) => formatInterventionStatus(row.status),
    },
    {
        key: "createdAt",
        header: "Creato il",
        render: (row) => formatDateTime(row.createdAt),
    },
    {
        key: "actions",
        header: "Azioni",
        className: "text-right",
        render: () => null,
    },
];
