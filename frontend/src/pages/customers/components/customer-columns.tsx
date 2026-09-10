import type { EntityCardSlot } from "@/components/entity-card-list";
import { formatDate } from "@/lib/utils";
import type { CustomerDto } from "@/types/dtos";
import type { ReactNode } from "react";

export type CustomerColumn = {
    key: keyof CustomerDto | "actions";
    header: string;
    className?: string;
    render: (row: CustomerDto) => ReactNode;
    cardSlot?: EntityCardSlot;
};

export const customerColumns: CustomerColumn[] = [
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
        header: "Telefono 1",
        render: (row) => row.phoneNumber ?? "-",
    },
    {
        key: "phoneNumberSecondary",
        header: "Telefono 2",
        render: (row) => row.phoneNumberSecondary ?? "-",
    },
    {
        key: "email",
        header: "Email",
        cardSlot: "wide",
        render: (row) => row.email ?? "-",
    },
    {
        key: "city",
        header: "Località",
        render: (row) => row.city ?? "-",
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
