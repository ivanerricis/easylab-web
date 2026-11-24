import CustomerLink from "@/components/customer-link";
import type { EntityColumn } from "@/components/entity-table";
import { formatContractPackage, formatContractStatus, formatContractType } from "@/lib/contracts";
import { formatDeviceLine } from "@/lib/customerDevices";
import { entityPaths } from "@/lib/entityPaths";
import { formatDate } from "@/lib/utils";
import type { ContractDto } from "@/types/dtos";
import { Link } from "react-router-dom";

// Le proprietà di `EntityColumn` (ordinamento, visibilità), con la chiave ristretta ai campi del
// contratto più le colonne composte.
export type ContractColumn = Omit<EntityColumn<ContractDto>, "key"> & {
    key: keyof ContractDto | "package" | "actions";
};

export const contractColumns: ContractColumn[] = [
    {
        key: "id",
        header: "ID",
        render: (row) => row.id,
    },
    {
        key: "customerName",
        header: "Cliente",
        sortKey: "customer",
        hideable: false,
        cardSlot: "title",
        render: (row) => <CustomerLink customerId={row.customerId} name={row.customerName} tone="inherit" />,
    },
    {
        key: "providerName",
        header: "Fornitore",
        render: (row) => (
            <Link
                to={entityPaths.provider(row.providerId)}
                className="underline decoration-current/40 underline-offset-4 hover:decoration-current focus-visible:underline"
            >
                {row.providerName}
            </Link>
        ),
    },
    {
        key: "type",
        header: "Tipo",
        render: (row) => formatContractType(row.type),
    },
    {
        key: "package",
        header: "Pacchetto",
        render: (row) => (row.assistance ? formatContractPackage(row) : "-"),
    },
    {
        key: "devices",
        header: "Dispositivi",
        cardSlot: "wide",
        // Uno per riga: "Nome – Tipo – S/N", senza i seriali la colonna non distinguerebbe due apparecchi omonimi.
        render: (row) =>
            row.devices.length > 0 ? (
                <ul className="grid gap-0.5">
                    {row.devices.map((device) => (
                        <li key={device.id}>{formatDeviceLine(device)}</li>
                    ))}
                </ul>
            ) : (
                "-"
            ),
    },
    {
        key: "startDate",
        header: "Inizio",
        sortKey: "startDate",
        defaultSortDirection: "desc",
        render: (row) => formatDate(row.startDate),
    },
    {
        key: "endDate",
        header: "Fine",
        sortKey: "endDate",
        defaultSortDirection: "desc",
        render: (row) => formatDate(row.endDate),
    },
    {
        key: "effectiveStatus",
        header: "Stato",
        cardSlot: "badge",
        render: (row) => formatContractStatus(row.effectiveStatus),
    },
    {
        key: "actions",
        header: "Azioni",
        className: "text-right",
        render: () => null,
    },
];

/**
 * Le colonne di un elenco di contratti che sta già dentro la scheda di cliente o fornitore: lì
 * la colonna di chi è già noto direbbe sempre la stessa cosa in ogni riga.
 */
export const contractColumnsWithout = (omitted: "customerName" | "providerName"): ContractColumn[] =>
    contractColumns.filter((column) => column.key !== omitted).map((column) => ({ ...column, sortKey: undefined }));
