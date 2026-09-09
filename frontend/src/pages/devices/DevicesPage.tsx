import CreateDeviceDialog, { type DeviceSubmitValues } from "@/components/dialogs/create/createDeviceDialog";
import SimpleEntityPage from "@/components/simple-entity-page";
import { createDevice, deleteDevice, listDevices, updateDevice } from "@/lib/api";
import type { DeviceDto } from "@/types/dtos";
import { deviceColumns } from "./components/device-columns";

const toPayload = (values: DeviceSubmitValues) => ({ name: values.name.trim() });

const DevicesPage = () => (
    <SimpleEntityPage<DeviceDto, DeviceSubmitValues>
        title="Dispositivi"
        description="Gestisci i dispositivi del laboratorio."
        createLabel="Crea nuovo dispositivo"
        searchPlaceholder="Cerca dispositivo..."
        entityLabel="dispositivo"
        tableKey="devices"
        columns={deviceColumns}
        emptyMessage="Nessun dispositivo disponibile."
        listRows={listDevices}
        loadErrorMessage="Impossibile caricare i dispositivi"
        Dialog={CreateDeviceDialog}
        onCreate={(values) => createDevice(toPayload(values))}
        onEdit={(row, values) => updateDevice(row.id, toPayload(values))}
        onDelete={(row) => deleteDevice(row.id)}
        notFoundMessage="Dispositivo non trovato"
        deleteTitle="Elimina dispositivo"
        deleteDescription={(row) => `Sei sicuro di voler eliminare il dispositivo ${row.name}?`}
        deleteFallbackDescription="Sei sicuro di voler eliminare questo dispositivo?"
        deleteSuccessMessage="Dispositivo eliminato con successo"
        deleteErrorMessage="Impossibile eliminare il dispositivo"
    />
);

export default DevicesPage;
