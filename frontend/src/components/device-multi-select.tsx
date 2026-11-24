import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDeviceLine } from "@/lib/customerDevices";
import type { LinkedDeviceDto } from "@/types/dtos";
import { Plus } from "lucide-react";
import { useId } from "react";

type DeviceMultiSelectProps = {
    /** Il gruppo ha un'etichetta per gli screen reader: il titolo visibile sta nel `FormField` attorno. */
    "aria-label": string;
    /** I dispositivi del cliente scelto, già caricati. */
    devices: LinkedDeviceDto[];
    selectedIds: number[];
    onChange: (ids: number[]) => void;
    /** Senza cliente scelto non c'è niente da elencare: l'elenco è spento e lo dice. */
    disabled?: boolean;
    isLoading?: boolean;
    /** "Nuovo dispositivo": crea al volo un dispositivo del cliente e lo seleziona. */
    onCreate: () => void;
};

/**
 * La scelta (facoltativa, anche più d'uno) dei dispositivi di un cliente per un contratto: un elenco
 * di caselle con "Nome – Tipo – S/N", e il pulsante per crearne uno nuovo senza uscire dal modulo.
 * Un elenco e non un menu a tendina: i dispositivi di un cliente sono pochi, e vederli tutti
 * evita di aprire e chiudere un menu per ogni scelta.
 */
const DeviceMultiSelect = ({
    devices,
    selectedIds,
    onChange,
    disabled = false,
    isLoading = false,
    onCreate,
    ...rest
}: DeviceMultiSelectProps) => {
    const baseId = useId();

    const toggle = (id: number, checked: boolean) =>
        onChange(checked ? [...selectedIds, id] : selectedIds.filter((selected) => selected !== id));

    return (
        <div className="grid gap-2">
            <div
                role="group"
                aria-label={rest["aria-label"]}
                aria-disabled={disabled || undefined}
                className="grid max-h-40 gap-1 overflow-y-auto rounded-md border p-2"
            >
                {disabled ? (
                    <p className="text-sm text-muted-foreground">Seleziona prima un cliente.</p>
                ) : isLoading ? (
                    <p className="text-sm text-muted-foreground">Caricamento dei dispositivi...</p>
                ) : devices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Il cliente non ha ancora dispositivi.</p>
                ) : (
                    devices.map((device) => {
                        const id = `${baseId}-${device.id}`;

                        return (
                            <div key={device.id} className="flex items-start gap-2">
                                <Checkbox
                                    id={id}
                                    className="mt-1"
                                    checked={selectedIds.includes(device.id)}
                                    onCheckedChange={(checked) => toggle(device.id, checked === true)}
                                />
                                <label htmlFor={id} className="cursor-pointer text-base leading-snug break-words">
                                    {formatDeviceLine(device)}
                                </label>
                            </div>
                        );
                    })
                )}
            </div>

            <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                disabled={disabled}
                onClick={onCreate}
            >
                <Plus />
                Nuovo dispositivo
            </Button>
        </div>
    );
};

export default DeviceMultiSelect;
