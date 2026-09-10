import HoverDetailCell from "@/components/hover-detail-cell";
import { formatDateTime, formatDate } from "@/lib/utils";
import { formatInterventionStatus, formatInterventionTime, formatInterventionType } from "@/lib/interventions";
import type { InterventionDto } from "@/types/dtos";
import type { ReactNode } from "react";

export type InterventionColumn = {
    key: keyof InterventionDto | "actions" | "schedule";
    header: string;
    className?: string;
    render: (row: InterventionDto) => ReactNode;
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
        render: (row) => {
            if (!row.interventionDate) {
                return "-";
            }

            if (!row.startTime || !row.endTime) {
                return formatDate(row.interventionDate);
            }

            return `${formatDate(row.interventionDate)} ${formatInterventionTime(row.startTime)}-${formatInterventionTime(row.endTime)}`;
        },
    },
    {
        key: "status",
        header: "Stato",
        render: (row) => formatInterventionStatus(row.status),
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
