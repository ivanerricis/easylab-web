import type { EntityColumn } from "@/components/entity-table";
import HoverDetailCell from "@/components/hover-detail-cell";
import { formatDateTime, formatDate } from "@/lib/utils";
import { formatInterventionStatus, formatInterventionTime, formatInterventionType } from "@/lib/interventions";
import type { InterventionDto } from "@/types/dtos";

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
        render: (row) => row.customer,
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
        render: (row) => {
            if (!row.interventionDate) {
                return "-";
            }

            if (!row.startTime || !row.endTime) {
                return formatDate(row.interventionDate);
            }

            // L'orario resta intero: in mezza scheda su mobile andava a capo sul trattino
            // ("13:00-" / "14:30"). Così a capo va, se serve, fra la data e l'orario.
            return (
                <>
                    {formatDate(row.interventionDate)}{" "}
                    <span className="whitespace-nowrap">
                        {formatInterventionTime(row.startTime)}-{formatInterventionTime(row.endTime)}
                    </span>
                </>
            );
        },
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
