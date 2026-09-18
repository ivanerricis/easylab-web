import CustomerLink from "@/components/customer-link";
import type { EntityCardSlot } from "@/components/entity-card-list";
import HoverDetailCell from "@/components/hover-detail-cell";
import { formatInterventionStatus, formatInterventionType } from "@/lib/interventions";
import { formatDateTime } from "@/lib/utils";
import type { InterventionDto, ReportDto } from "@/types/dtos";
import type { ReactNode } from "react";
import { formatReportStatus } from "@/lib/reports";
import InterventionSchedule from "@/components/intervention-schedule";

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
    cardSlot?: EntityCardSlot;
};

export type CollaboratorInterventionColumn = {
    key: keyof InterventionDto | "actions" | "schedule";
    header: string;
    className?: string;
    render: (row: InterventionDto) => ReactNode;
    cardSlot?: EntityCardSlot;
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
        cardSlot: "title",
        render: (row) => <CustomerLink customerId={row.customerId} name={row.customer} tone="inherit" />,
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
        cardSlot: "wide",
        render: (row) => <HoverDetailCell text={row.issue} detail={row.issueDescription} />,
    },
    {
        // Lo stato in parole e non solo nel colore della riga: stessa scelta dell'elenco
        // report, per chi non distingue verde e rosso.
        key: "closed",
        header: "Stato",
        cardSlot: "badge",
        render: (row) => formatReportStatus(row.closed),
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
        cardSlot: "title",
        render: (row) => <CustomerLink customerId={row.customerId} name={row.customer} tone="inherit" />,
    },
    {
        key: "customerPhone",
        header: "Telefono",
        render: (row) => row.customerPhone ?? "-",
    },
    {
        key: "type",
        header: "Tipo",
        render: (row) => <HoverDetailCell text={formatInterventionType(row.type)} detail={row.description} />,
    },
    {
        key: "schedule",
        header: "Data/Orario",
        render: (row) => (
            <InterventionSchedule
                interventionDate={row.interventionDate}
                startTime={row.startTime}
                endTime={row.endTime}
            />
        ),
    },
    {
        key: "status",
        header: "Stato",
        cardSlot: "badge",
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
