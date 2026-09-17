export type ReportVisibilityFilter = "all" | "open" | "closed";

export type ReportSortOption = "createdAt:desc" | "createdAt:asc" | "customer:asc" | "customer:desc";

export const DEFAULT_REPORT_SORT_OPTION: ReportSortOption = "createdAt:desc";

export const reportSortOptions: { value: ReportSortOption; label: string }[] = [
    { value: "createdAt:desc", label: "Più recenti" },
    { value: "createdAt:asc", label: "Meno recenti" },
    { value: "customer:asc", label: "Cliente (A-Z)" },
    { value: "customer:desc", label: "Cliente (Z-A)" },
];
