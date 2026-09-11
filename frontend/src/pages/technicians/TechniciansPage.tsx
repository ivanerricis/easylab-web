import CreateTechnicianDialog, {
    type TechnicianSubmitValues,
} from "@/components/dialogs/create/createTechnicianDialog";
import SimpleEntityPage from "@/components/simple-entity-page";
import { createTechnician, deleteTechnician, listTechnicians, updateTechnician } from "@/lib/api";
import { trimOrNull } from "@/lib/utils";
import type { TechnicianDto } from "@/types/dtos";
import { useNavigate } from "react-router-dom";
import { technicianColumns } from "./components/technician-columns";

const toPayload = (values: TechnicianSubmitValues) => ({
    firstName: values.firstName.trim(),
    lastName: trimOrNull(values.lastName),
    phoneNumber: trimOrNull(values.phoneNumber),
    vatNumber: trimOrNull(values.vatNumber),
});

const TechniciansPage = () => {
    const navigate = useNavigate();

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
            onCreate={(values) => createTechnician(toPayload(values))}
            onEdit={(row, values) => updateTechnician(row.id, toPayload(values))}
            onDelete={(row) => deleteTechnician(row.id)}
            notFoundMessage="Tecnico non trovato"
            deleteTitle="Elimina tecnico"
            deleteDescription={(row) =>
                `Sei sicuro di voler eliminare il tecnico ${row.firstName} ${row.lastName ?? ""}?`
            }
            deleteFallbackDescription="Sei sicuro di voler eliminare questo tecnico?"
            deleteSuccessMessage="Tecnico eliminato con successo"
            deleteErrorMessage="Impossibile eliminare il tecnico"
            onOpenRow={(id) => void navigate(`/technicians/${id}`)}
        />
    );
};

export default TechniciansPage;
