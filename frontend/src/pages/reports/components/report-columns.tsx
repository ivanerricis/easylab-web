import type { EntityCardSlot } from "@/components/entity-card-list";
import HoverDetailCell from "@/components/hover-detail-cell";
import { formatDateTime, formatEuro } from "@/lib/utils";
import type { ReportDto } from "@/types/dtos";
import type { ReactNode } from "react";

export type ReportColumn = {
    key: keyof ReportDto | "actions";
    header: string;
    className?: string;
    render: (row: ReportDto) => ReactNode;
    cardSlot?: EntityCardSlot;
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
        cardSlot: "title",
        render: (row) => row.customer,
    },
    {
        // Lo stato non era scritto da nessuna parte: lo diceva solo il colore della riga
        // (verde/rosso da reports-table.tsx), quindi l'informazione più importante della
        // pagina era invisibile a chi non distingue i due colori e spariva in stampa.
        // Stessa formulazione della scheda cliente, che questa colonna ce l'aveva già.
        key: "closed",
        header: "Stato",
        cardSlot: "badge",
        render: (row) => (row.closed ? "Chiuso" : "Aperto"),
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
        render: (row) => (row.dataBackup ? "Si" : "No"),
    },
    {
        key: "charger",
        header: "Alimentatore",
        render: (row) => (row.charger ? "Si" : "No"),
    },
    {
        key: "totalPrice",
        header: "Prezzo totale",
        render: (row) => formatEuro(row.totalPrice),
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
