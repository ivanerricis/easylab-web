import CreateIssueDialog, { type IssueSubmitValues } from "@/components/dialogs/create/createIssueDialog";
import SimpleEntityPage from "@/components/simple-entity-page";
import { createIssue, deleteIssue, listIssues, updateIssue } from "@/lib/api";
import type { IssueDto } from "@/types/dtos";
import { issueColumns } from "./components/issue-columns";

const toPayload = (values: IssueSubmitValues) => ({ description: values.description.trim() });

const IssuesPage = () => (
    <SimpleEntityPage<IssueDto, IssueSubmitValues>
        title="Difetti"
        description="Gestisci i difetti del laboratorio."
        createLabel="Crea nuovo difetto"
        searchPlaceholder="Cerca difetto..."
        entityLabel="difetto"
        tableKey="issues"
        columns={issueColumns}
        emptyMessage="Nessun difetto disponibile."
        listRows={listIssues}
        loadErrorMessage="Impossibile caricare i difetti"
        Dialog={CreateIssueDialog}
        onCreate={(values) => createIssue(toPayload(values))}
        onEdit={(row, values) => updateIssue(row.id, toPayload(values))}
        onDelete={(row) => deleteIssue(row.id)}
        notFoundMessage="Difetto non trovato"
        deleteTitle="Elimina difetto"
        deleteDescription={(row) => `Sei sicuro di voler eliminare il difetto: ${row.description}?`}
        deleteFallbackDescription="Sei sicuro di voler eliminare questo difetto?"
        deleteSuccessMessage="Difetto eliminato con successo"
        deleteErrorMessage="Impossibile eliminare il difetto"
    />
);

export default IssuesPage;
