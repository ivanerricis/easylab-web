import CustomerLink from "@/components/customer-link";
import type { EntityColumn } from "@/components/entity-table";
import HoverDetailCell from "@/components/hover-detail-cell";
import { formatDateTime, formatEuro } from "@/lib/utils";
import type { ReportDto } from "@/types/dtos";
import { formatReportStatus } from "@/lib/reports";

// Le proprietà di `EntityColumn` (ordinamento, visibilità), con la chiave ristretta ai campi
// di questa entità.
export type ReportColumn = Omit<EntityColumn<ReportDto>, "key"> & {
    key: keyof ReportDto | "actions";
};

export const reportColumns: ReportColumn[] = [
    {
        key: "id",
        header: "ID",
        render: (row) => row.id,
    },
    {
        key: "customer",
        header: "Cliente",
        sortKey: "customer",
        hideable: false,
        cardSlot: "title",
        render: (row) => <CustomerLink customerId={row.customerId} name={row.customer} tone="inherit" />,
    },
    {
        // Lo stato non era scritto da nessuna parte: lo diceva solo il colore della riga
        // (verde/rosso da reports-table.tsx), quindi l'informazione più importante della
        // pagina era invisibile a chi non distingue i due colori e spariva in stampa.
        // Stessa formulazione della scheda cliente, che questa colonna ce l'aveva già.
        key: "closed",
        header: "Stato",
        cardSlot: "badge",
        render: (row) => formatReportStatus(row.closed),
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
        key: "password",
        header: "Password",
        render: (row) => row.password ?? "-",
    },
    {
        key: "dataBackup",
        header: "Backup dati",
        render: (row) => (row.dataBackup ? "Sì" : "No"),
    },
    {
        key: "charger",
        header: "Alimentatore",
        render: (row) => (row.charger ? "Sì" : "No"),
    },
    {
        key: "totalPrice",
        header: "Prezzo totale",
        render: (row) => formatEuro(row.totalPrice),
    },
    {
        key: "createdAt",
        header: "Creato il",
        sortKey: "createdAt",
        defaultSortDirection: "desc",
        render: (row) => formatDateTime(row.createdAt),
    },
    {
        key: "actions",
        header: "Azioni",
        className: "text-right",
        render: () => null,
    },
];
