import CreateProviderDialog, { type ProviderSubmitValues } from "@/components/dialogs/create/createProviderDialog";
import SimpleEntityPage from "@/components/simple-entity-page";
import { createProvider, deleteProvider, listProviders, updateProvider } from "@/lib/api";
import { entityPaths } from "@/lib/entityPaths";
import { toProviderPayload } from "@/lib/providers";
import type { ProviderDto } from "@/types/dtos";
import { providerColumns } from "./components/provider-columns";

const ProvidersPage = () => {
    return (
        <SimpleEntityPage<ProviderDto, ProviderSubmitValues>
            title="Fornitori"
            description="Gestisci i fornitori con cui il laboratorio stipula i contratti."
            createLabel="Crea nuovo fornitore"
            searchPlaceholder="Cerca fornitore..."
            entityLabel="fornitore"
            tableKey="providers"
            columns={providerColumns}
            emptyMessage="Nessun fornitore disponibile."
            listRows={listProviders}
            loadErrorMessage="Impossibile caricare i fornitori"
            Dialog={CreateProviderDialog}
            onCreate={(values) => createProvider(toProviderPayload(values))}
            onEdit={(row, values) => updateProvider(row.id, toProviderPayload(values))}
            onDelete={(row) => deleteProvider(row.id)}
            notFoundMessage="Fornitore non trovato"
            deleteTitle="Elimina fornitore"
            deleteDescription={(row) => `Sei sicuro di voler eliminare il fornitore ${row.providerName}?`}
            deleteFallbackDescription="Sei sicuro di voler eliminare questo fornitore?"
            deleteSuccessMessage="Fornitore eliminato con successo"
            deleteErrorMessage="Impossibile eliminare il fornitore"
            getOpenPath={entityPaths.provider}
        />
    );
};

export default ProvidersPage;
