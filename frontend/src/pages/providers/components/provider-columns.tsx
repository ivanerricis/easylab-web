import type { EntityColumn } from "@/components/entity-table";
import { formatProviderContact } from "@/lib/providers";
import { formatDate } from "@/lib/utils";
import type { ProviderDto } from "@/types/dtos";

export const providerColumns: EntityColumn<ProviderDto>[] = [
    {
        key: "id",
        header: "ID",
        render: (row) => row.id,
    },
    {
        key: "providerName",
        header: "Fornitore",
        cardSlot: "title",
        hideable: false,
        render: (row) => row.providerName,
    },
    {
        key: "contact",
        header: "Referente",
        render: (row) => formatProviderContact(row),
    },
    {
        key: "email",
        header: "Email",
        render: (row) => row.email,
    },
    {
        key: "phoneNumber",
        header: "Telefono",
        render: (row) => row.phoneNumber,
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
