import CreateCollaboratorDialog, {
    type CollaboratorSubmitValues,
} from "@/components/dialogs/create/createCollaboratorDialog";
import SimpleEntityPage from "@/components/simple-entity-page";
import { createCollaborator, deleteCollaborator, listCollaborators, updateCollaborator } from "@/lib/api";
import { toCollaboratorPayload } from "@/lib/people";
import type { CollaboratorDto } from "@/types/dtos";
import { entityPaths } from "@/lib/entityPaths";
import { collaboratorColumns } from "./components/collaborator-columns";

const CollaboratorsPage = () => {
    return (
        <SimpleEntityPage<CollaboratorDto, CollaboratorSubmitValues>
            title="Collaboratori"
            description="Gestisci i collaboratori del laboratorio."
            createLabel="Crea nuovo collaboratore"
            searchPlaceholder="Cerca collaboratore..."
            entityLabel="collaboratore"
            tableKey="collaborators"
            columns={collaboratorColumns}
            emptyMessage="Nessun collaboratore disponibile."
            listRows={listCollaborators}
            loadErrorMessage="Impossibile caricare i collaboratori"
            Dialog={CreateCollaboratorDialog}
            onCreate={(values) => createCollaborator(toCollaboratorPayload(values))}
            onEdit={(row, values) => updateCollaborator(row.id, toCollaboratorPayload(values))}
            onDelete={(row) => deleteCollaborator(row.id)}
            notFoundMessage="Collaboratore non trovato"
            deleteTitle="Elimina collaboratore"
            deleteDescription={(row) =>
                `Sei sicuro di voler eliminare il collaboratore ${row.firstName} ${row.lastName ?? ""}?`
            }
            deleteFallbackDescription="Sei sicuro di voler eliminare questo collaboratore?"
            deleteSuccessMessage="Collaboratore eliminato con successo"
            deleteErrorMessage="Impossibile eliminare il collaboratore"
            getOpenPath={entityPaths.collaborator}
        />
    );
};

export default CollaboratorsPage;
