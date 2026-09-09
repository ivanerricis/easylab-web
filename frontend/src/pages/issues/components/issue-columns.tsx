import { isCatchAllIssue } from "@/lib/issues";
import { formatDate } from "@/lib/utils";
import type { IssueDto } from "@/types/dtos";
import type { ReactNode } from "react";

export type IssueColumn = {
    key: keyof IssueDto | "actions";
    header: string;
    className?: string;
    render: (row: IssueDto) => ReactNode;
};

export const issueColumns: IssueColumn[] = [
    {
        key: "id",
        header: "ID",
        render: (row) => row.id,
    },
    {
        key: "description",
        header: "Descrizione",
        // La voce generica non ha i pulsanti di modifica ed eliminazione: senza una parola
        // qui accanto sembrerebbe un difetto dell'elenco, non una scelta.
        render: (row) =>
            isCatchAllIssue(row.description) ? (
                <span className="flex items-center gap-2">
                    {row.description}
                    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">voce fissa</span>
                </span>
            ) : (
                row.description
            ),
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
