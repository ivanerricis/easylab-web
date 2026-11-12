import CustomDialog from "@/components/dialogs/customDialog";
import { DetailSection } from "@/components/detail-item";
import { Button } from "@/components/ui/button";
import { usePendingAction } from "@/hooks/usePendingAction";
import {
    deleteSignedContract,
    getApiErrorMessage,
    getSignedContractUrl,
    signedContractMaxBytes,
    uploadSignedContract,
} from "@/lib/api";
import { formatDateTime, formatFileSize, openPrintWindow } from "@/lib/utils";
import type { ContractDto } from "@/types/dtos";
import { ExternalLink, FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

type SignedContractSectionProps = {
    contract: ContractDto;
    /** Dopo un caricamento o un'eliminazione: la scheda si ricarica per mostrare il nuovo stato. */
    onChanged: () => Promise<unknown>;
};

/**
 * Il contratto firmato dal cliente: lo si stampa, lo si fa firmare e lo si carica qui come PDF.
 * Uno solo per contratto: un nuovo caricamento sostituisce il precedente. L'invio al cliente
 * sta nell'intestazione della scheda, accanto a Stampa.
 */
const SignedContractSection = ({ contract, onChanged }: SignedContractSectionProps) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const signed = contract.signedContract;

    const deleteAction = usePendingAction({
        run: () => deleteSignedContract(contract.id),
        successMessage: "Contratto firmato eliminato",
        errorMessage: "Impossibile eliminare il contratto firmato",
        onDone: () => onChanged(),
    });

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        // Svuotato subito: così scegliere di nuovo lo stesso file fa ripartire il caricamento.
        event.target.value = "";

        if (!file) {
            return;
        }

        // Gli stessi controlli del server, per non mandare per niente un file che rifiuterebbe.
        // Il server guarda comunque i byte: l'estensione qui è solo un aiuto.
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            toast.error("Il contratto firmato deve essere un file PDF");
            return;
        }

        if (file.size > signedContractMaxBytes) {
            toast.error(`Il file supera la dimensione massima di ${formatFileSize(signedContractMaxBytes)}`);
            return;
        }

        setIsUploading(true);

        try {
            await uploadSignedContract(contract.id, file);
            toast.success(signed ? "Contratto firmato sostituito" : "Contratto firmato caricato");
            await onChanged();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare il contratto firmato"));
        } finally {
            setIsUploading(false);
        }
    };

    const chooseFile = () => inputRef.current?.click();

    return (
        <DetailSection title="Contratto firmato" isBusy={isUploading}>
            {/* Il campo nativo apre la finestra del sistema; il pulsante visibile lo comanda,
                come in `SettingsFileInput`. `relative`: vedi lo stesso commento lì. */}
            <div className="relative flex flex-col gap-3">
                <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => void handleFileChange(event)}
                    tabIndex={-1}
                    aria-hidden="true"
                    aria-label="File del contratto firmato"
                    className="sr-only"
                />

                {signed ? (
                    <>
                        <div className="flex min-w-0 items-start gap-3">
                            <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <div className="min-w-0">
                                <p className="text-sm font-medium break-all">{signed.fileName}</p>
                                <p className="text-sm text-muted-foreground">
                                    Caricato il {formatDateTime(signed.uploadedAt)} · {formatFileSize(signed.sizeBytes)}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => openPrintWindow(getSignedContractUrl(contract.id))}
                            >
                                <ExternalLink className="size-4" />
                                Apri
                            </Button>
                            <Button type="button" variant="outline" disabled={isUploading} onClick={chooseFile}>
                                <RefreshCw className="size-4" />
                                {isUploading ? "Caricamento…" : "Sostituisci"}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isUploading}
                                onClick={() => deleteAction.open()}
                                className="text-destructive hover:text-destructive"
                            >
                                <Trash2 className="size-4" />
                                Elimina
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground">
                            Nessun contratto firmato. Stampa il contratto, fallo firmare al cliente e carica qui la
                            scansione in PDF: potrai poi inviarla al cliente via email.
                        </p>
                        <div>
                            <Button type="button" variant="outline" disabled={isUploading} onClick={chooseFile}>
                                <Upload className="size-4" />
                                {isUploading ? "Caricamento…" : "Carica PDF firmato"}
                            </Button>
                        </div>
                    </>
                )}
            </div>

            <CustomDialog
                open={deleteAction.isOpen}
                onOpenChange={deleteAction.onOpenChange}
                title="Elimina contratto firmato"
                description="Il PDF firmato caricato per questo contratto verrà eliminato. Il contratto resta."
                confirmLabel="Elimina"
                confirmIcon={Trash2}
                destructive
                cancelLabel="Annulla"
                confirmDisabled={deleteAction.isRunning}
                onCancel={deleteAction.close}
                onConfirm={deleteAction.confirm}
            />
        </DetailSection>
    );
};

export default SignedContractSection;
