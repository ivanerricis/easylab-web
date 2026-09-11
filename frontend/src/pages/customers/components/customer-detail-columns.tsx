import type { EntityColumn } from "@/components/entity-table";
import HoverDetailCell from "@/components/hover-detail-cell";
import { formatInterventionStatus, formatInterventionTime, formatInterventionType } from "@/lib/interventions";
import { formatDate, formatDateTime, formatEuro } from "@/lib/utils";
import type { InterventionDto, ReportDto } from "@/types/dtos";

/**
 * Colonne delle due tabelle della scheda cliente.
 *
 * Stesse colonne della scheda collaboratore, meno quelle che qui ripeterebbero il cliente
 * (nome e telefono stanno già nella scheda dati in alto). In un file a parte per lo stesso
 * motivo di `collaborator-detail-columns`: `EntityTable` ricorda le larghezze per chiave di
 * colonna, e l'array non va ricreato a ogni render.
 *
 * Prima la scheda aveva tre sole colonne (numero, dispositivo, stato): per sapere di che
 * guasto si trattasse o quando fosse entrato il dispositivo bisognava aprire ogni report.
 */
export const customerReportColumns: EntityColumn<ReportDto>[] = [
    {
        key: "id",
        header: "ID",
        render: (row) => row.id,
    },
    {
        key: "device",
        header: "Dispositivo",
        cardSlot: "title",
        render: (row) => row.device,
    },
    {
        key: "issue",
        header: "Difetto",
        cardSlot: "wide",
        render: (row) => <HoverDetailCell text={row.issue} detail={row.issueDescription} />,
    },
    {
        key: "totalPrice",
        header: "Prezzo totale",
        render: (row) => formatEuro(row.totalPrice),
    },
    {
        key: "closed",
        header: "Stato",
        cardSlot: "badge",
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

export const customerInterventionColumns: EntityColumn<InterventionDto>[] = [
    {
        key: "id",
        header: "ID",
        render: (row) => row.id,
    },
    {
        key: "type",
        header: "Tipo",
        cardSlot: "title",
        render: (row) => <HoverDetailCell text={formatInterventionType(row.type)} detail={row.description} />,
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

            // Come nella scheda collaboratore: se va a capo, va fra data e orario.
            return (
                <>
                    {formatDate(row.interventionDate)}{" "}
                    <span className="whitespace-nowrap">
                        {formatInterventionTime(row.startTime)}-{formatInterventionTime(row.endTime)}
                    </span>
                </>
            );
        },
    },
    {
        key: "collaborator",
        header: "Collaboratore",
        render: (row) => row.collaborator,
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
