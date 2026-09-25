import { useRef, type ChangeEvent, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type SettingsFileInputProps = {
    id: string;
    label: ReactNode;
    accept: string;
    disabled?: boolean;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    /** Cosa scrivere accanto al pulsante: il file scelto, o lo stato del caricamento. */
    status?: ReactNode;
};

/**
 * Selettore di file nello stile dell'app, per il logo in Azienda e per il ripristino da file
 * esterno in Backup. Il campo nativo (`<input type="file">`) disegnava il suo pulsante col
 * tema del sistema operativo, diverso da tutti gli altri dell'app e illeggibile in tema scuro.
 *
 * Il campo nativo resta, nascosto alla vista e fuori dal giro del Tab: è lui che apre la
 * finestra del sistema e che porta il file, e l'etichetta resta collegata a lui (i test ci
 * caricano i file tramite l'etichetta). Il pulsante visibile è l'unico punto di tabulazione e
 * gira il clic al campo, così il focus ha l'aspetto degli altri pulsanti senza ricopiarne lo
 * stile; l'etichetta arriva agli screen reader come descrizione del pulsante.
 */
const SettingsFileInput = ({
    id,
    label,
    accept,
    disabled = false,
    onChange,
    status = "Nessun file scelto",
}: SettingsFileInputProps) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const labelId = `${id}-label`;
    const statusId = `${id}-status`;

    return (
        <div className="grid gap-2">
            <Label id={labelId} htmlFor={id}>
                {label}
            </Label>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                <input
                    ref={inputRef}
                    id={id}
                    type="file"
                    accept={accept}
                    disabled={disabled}
                    onChange={onChange}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="sr-only"
                />
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    aria-describedby={`${labelId} ${statusId}`}
                    onClick={() => inputRef.current?.click()}
                >
                    <Upload className="size-4" />
                    Scegli file…
                </Button>
                <span id={statusId} className="min-w-0 text-sm break-all text-muted-foreground" aria-live="polite">
                    {status}
                </span>
            </div>
        </div>
    );
};

export default SettingsFileInput;
