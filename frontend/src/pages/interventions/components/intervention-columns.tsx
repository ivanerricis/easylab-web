import CustomerLink from "@/components/customer-link";
import type { EntityColumn } from "@/components/entity-table";
import HoverDetailCell from "@/components/hover-detail-cell";
import { formatDateTime } from "@/lib/utils";
import { formatInterventionStatus, formatInterventionType } from "@/lib/interventions";
import type { InterventionDto } from "@/types/dtos";
import InterventionSchedule from "@/components/intervention-schedule";

// Le proprietà di `EntityColumn` (ordinamento, visibilità), con la chiave ristretta ai campi
// di questa entità.
export type InterventionColumn = Omit<EntityColumn<InterventionDto>, "key"> & {
    key: keyof InterventionDto | "actions" | "schedule";
};

export const interventionColumns: InterventionColumn[] = [
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
        key: "customerPhone",
        header: "Telefono",
        render: (row) => row.customerPhone ?? "-",
    },
    {
        key: "collaborator",
        header: "Collaboratore",
        render: (row) => row.collaborator,
    },
    {
        key: "type",
        header: "Tipo",
        render: (row) => <HoverDetailCell text={formatInterventionType(row.type)} detail={row.description} />,
    },
    {
        key: "schedule",
        header: "Data/Orario",
        sortKey: "interventionDate",
        defaultSortDirection: "desc",
        render: (row) => (
            <InterventionSchedule
                interventionDate={row.interventionDate}
                startTime={row.startTime}
                endTime={row.endTime}
            />
        ),
    },
    {
        key: "status",
        header: "Stato",
        sortKey: "status",
        defaultSortDirection: "desc",
        cardSlot: "badge",
        render: (row) => formatInterventionStatus(row.status),
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
