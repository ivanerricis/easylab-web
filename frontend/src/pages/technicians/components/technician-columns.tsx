import type { EntityCardSlot } from "@/components/entity-card-list";
import { formatDate } from "@/lib/utils";
import type { TechnicianDto } from "@/types/dtos";
import type { ReactNode } from "react";

export type TechnicianColumn = {
    key: keyof TechnicianDto | "actions";
    header: string;
    className?: string;
    render: (row: TechnicianDto) => ReactNode;
    cardSlot?: EntityCardSlot;
};

export const technicianColumns: TechnicianColumn[] = [
    {
        key: "id",
        header: "ID",
        render: (row) => row.id,
    },
    {
        key: "firstName",
        header: "Nome",
        cardSlot: "title",
        render: (row) => row.firstName,
    },
    {
        key: "lastName",
        header: "Cognome",
        cardSlot: "title",
        render: (row) => row.lastName ?? "-",
    },
    {
        key: "phoneNumber",
        header: "Telefono",
        render: (row) => row.phoneNumber ?? "-",
    },
    {
        key: "vatNumber",
        header: "Partita IVA",
        render: (row) => row.vatNumber ?? "-",
    },
    {
        key: "createdAt",
        header: "Creato il",
        render: (row) => formatDate(row.createdAt),
    },
    {
        key: "actions",
        header: "Azioni",
        className: "text-right",
        render: () => null,
    },
];
