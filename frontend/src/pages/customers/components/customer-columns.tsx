import type { EntityColumn } from "@/components/entity-table";
import { formatDate } from "@/lib/utils";
import type { CustomerDto } from "@/types/dtos";

// Le proprietà di `EntityColumn` (ordinamento, visibilità), con la chiave ristretta ai campi
// di questa entità.
export type CustomerColumn = Omit<EntityColumn<CustomerDto>, "key"> & {
    key: keyof CustomerDto | "actions";
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
        sortKey: "name",
        hideable: false,
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
        sortKey: "createdAt",
        defaultSortDirection: "desc",
        render: (row) => formatDate(row.createdAt),
    },
    {
        key: "actions",
        header: "Azioni",
        className: "text-right",
        render: () => null,
    },
];
