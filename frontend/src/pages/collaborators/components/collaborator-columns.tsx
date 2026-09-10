import type { EntityCardSlot } from "@/components/entity-card-list";
import { formatDate } from "@/lib/utils";
import type { CollaboratorDto } from "@/types/dtos";
import type { ReactNode } from "react";

export type CollaboratorColumn = {
    key: keyof CollaboratorDto | "actions";
    header: string;
    className?: string;
    render: (row: CollaboratorDto) => ReactNode;
    cardSlot?: EntityCardSlot;
};

export const collaboratorColumns: CollaboratorColumn[] = [
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
