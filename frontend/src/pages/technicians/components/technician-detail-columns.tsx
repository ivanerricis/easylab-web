import type { EntityColumn } from "@/components/entity-table";
import HoverDetailCell from "@/components/hover-detail-cell";
import { formatDateTime, formatEuro } from "@/lib/utils";
import type { ReportDto } from "@/types/dtos";

/**
 * Colonne della tabella nella scheda del tecnico esterno.
 *
 * La colonna che mancava è il prezzo del suo lavoro, cioè il motivo per cui di solito si apre
 * questa scheda (quanto gli si deve, per quali report). Il dato arriva già con il report
 * (`technicianPrice`), quindi non serve una richiesta in più.
 */
export const technicianReportColumns: EntityColumn<ReportDto>[] = [
    {
        key: "id",
        header: "ID",
        render: (row) => row.id,
    },
    {
        key: "customer",
        header: "Cliente",
        cardSlot: "title",
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
        cardSlot: "wide",
        render: (row) => <HoverDetailCell text={row.issue} detail={row.issueDescription} />,
    },
    {
        key: "technicianPrice",
        header: "Prezzo tecnico",
        render: (row) => formatEuro(row.technicianPrice),
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
