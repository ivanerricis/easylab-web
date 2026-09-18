import CreateTechnicianDialog, {
    type TechnicianSubmitValues,
} from "@/components/dialogs/create/createTechnicianDialog";
import SimpleEntityPage from "@/components/simple-entity-page";
import { createTechnician, deleteTechnician, listTechnicians, updateTechnician } from "@/lib/api";
import { formatPersonName, toTechnicianPayload } from "@/lib/people";
import type { TechnicianDto } from "@/types/dtos";
import { entityPaths } from "@/lib/entityPaths";
import { technicianColumns } from "./components/technician-columns";

const TechniciansPage = () => {
    return (
        <SimpleEntityPage<TechnicianDto, TechnicianSubmitValues>
            title="Tecnici esterni"
            description="Gestisci i tecnici esterni a cui il laboratorio affida i lavori."
            createLabel="Crea nuovo tecnico"
            searchPlaceholder="Cerca tecnico..."
            entityLabel="tecnico"
            tableKey="technicians"
            columns={technicianColumns}
            emptyMessage="Nessun tecnico disponibile."
            listRows={listTechnicians}
            loadErrorMessage="Impossibile caricare i tecnici"
            Dialog={CreateTechnicianDialog}
            onCreate={(values) => createTechnician(toTechnicianPayload(values))}
            onEdit={(row, values) => updateTechnician(row.id, toTechnicianPayload(values))}
            onDelete={(row) => deleteTechnician(row.id)}
            notFoundMessage="Tecnico non trovato"
            deleteTitle="Elimina tecnico"
            deleteDescription={(row) => `Sei sicuro di voler eliminare il tecnico ${formatPersonName(row)}?`}
            deleteFallbackDescription="Sei sicuro di voler eliminare questo tecnico?"
            deleteSuccessMessage="Tecnico eliminato con successo"
            deleteErrorMessage="Impossibile eliminare il tecnico"
            getOpenPath={entityPaths.technician}
        />
    );
};

export default TechniciansPage;
