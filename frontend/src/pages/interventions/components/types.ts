import type { InterventionStatus, InterventionType } from "@/types/dtos";

// Derivati dai tipi del DTO invece di ripeterne i valori: uno stato o un tipo nuovo entra nei
// filtri da sé, e uno rinominato fa fallire la compilazione qui invece di restare un filtro morto.
export type InterventionStatusFilter = "all" | InterventionStatus;

export type InterventionTypeFilter = "all" | InterventionType;

export type InterventionSortOption =
    | "createdAt:desc"
    | "createdAt:asc"
    | "interventionDate:asc"
    | "interventionDate:desc"
    | "customer:asc"
    | "customer:desc"
    | "status:desc"
    | "status:asc";

export const DEFAULT_INTERVENTION_SORT_OPTION: InterventionSortOption = "createdAt:desc";

export const interventionSortOptions: { value: InterventionSortOption; label: string }[] = [
    { value: "createdAt:desc", label: "Più recenti" },
    { value: "createdAt:asc", label: "Meno recenti" },
    { value: "interventionDate:asc", label: "Data intervento crescente" },
    { value: "interventionDate:desc", label: "Data intervento decrescente" },
    { value: "customer:asc", label: "Cliente (A-Z)" },
    { value: "customer:desc", label: "Cliente (Z-A)" },
    { value: "status:desc", label: "Stato (prima i programmati)" },
    { value: "status:asc", label: "Stato (prima i completati)" },
];
