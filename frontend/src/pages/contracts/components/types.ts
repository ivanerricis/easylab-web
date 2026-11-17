import type { ContractEffectiveStatus, ContractType } from "@/types/dtos";

// Derivati dai tipi del DTO invece di ripeterne i valori: uno stato o un tipo nuovo entra nei
// filtri da sé, e uno rinominato fa fallire la compilazione qui invece di restare un filtro morto.
export type ContractTypeFilter = "all" | ContractType;

export type ContractStatusFilter = "all" | ContractEffectiveStatus;

export type ContractSortOption =
    | "createdAt:desc"
    | "createdAt:asc"
    | "startDate:desc"
    | "startDate:asc"
    | "endDate:asc"
    | "endDate:desc"
    | "customer:asc"
    | "customer:desc";

export const DEFAULT_CONTRACT_SORT_OPTION: ContractSortOption = "createdAt:desc";

export const contractSortOptions: { value: ContractSortOption; label: string }[] = [
    { value: "createdAt:desc", label: "Più recenti" },
    { value: "createdAt:asc", label: "Meno recenti" },
    { value: "startDate:desc", label: "Inizio decrescente" },
    { value: "startDate:asc", label: "Inizio crescente" },
    { value: "endDate:asc", label: "Scadenza più vicina" },
    { value: "endDate:desc", label: "Scadenza più lontana" },
    { value: "customer:asc", label: "Cliente (A-Z)" },
    { value: "customer:desc", label: "Cliente (Z-A)" },
];
