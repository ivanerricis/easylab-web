import type { EntityCardSlot } from "@/components/entity-card-list";
import { formatDate } from "@/lib/utils";
import type { DeviceDto } from "@/types/dtos";
import type { ReactNode } from "react";

export type DeviceColumn = {
    key: keyof DeviceDto | "actions";
    header: string;
    className?: string;
    render: (row: DeviceDto) => ReactNode;
    cardSlot?: EntityCardSlot;
};

export const deviceColumns: DeviceColumn[] = [
    {
        key: "id",
        header: "ID",
        render: (row) => row.id,
    },
    {
        key: "name",
        header: "Nome",
        cardSlot: "title",
        render: (row) => row.name,
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
