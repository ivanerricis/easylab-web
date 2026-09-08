import EntityTable from "@/components/entity-table";
import TableActionButton from "@/components/table-action-button";
import type { IssueDto } from "@/types/dtos";
import { Pencil, Trash2 } from "lucide-react";
import type { IssueColumn } from "./issue-columns";

type IssuesTableProps = {
    columns: IssueColumn[];
    rows: IssueDto[];
    onEditIssue: (id: number) => void;
    onDeleteIssue: (issue: IssueDto) => void;
};

const IssuesTable = ({ columns, rows, onEditIssue, onDeleteIssue }: IssuesTableProps) => {
    const renderRowActions = (row: IssueDto) => (
        <>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-primary/10 hover:bg-primary/20"
                onClick={() => onEditIssue(row.id)}
                aria-label={`Modifica difetto ${row.id}`}
            >
                <Pencil className="size-5 text-primary" />
            </TableActionButton>
            <TableActionButton
                variant="destructive"
                size="icon-lg"
                onClick={() => onDeleteIssue(row)}
                aria-label={`Elimina difetto ${row.id}`}
            >
                <Trash2 className="size-5" />
            </TableActionButton>
        </>
    );

    return (
        <EntityTable
            tableKey="issues"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyMessage="Nessun difetto disponibile."
            renderRowActions={renderRowActions}
        />
    );
};

export default IssuesTable;
