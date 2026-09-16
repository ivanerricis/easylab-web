export type InterventionStatusFilter = "all" | "programmato" | "in_lavorazione" | "completato";

export type InterventionTypeFilter = "all" | "consegna_materiale" | "intervento_sede" | "intervento_remoto";

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
