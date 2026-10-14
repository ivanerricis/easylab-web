import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download } from "lucide-react";
import CustomDialog from "@/components/dialogs/customDialog";
import { SettingsWarningNote } from "@/components/settings/settingsUi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { downloadTextFile } from "@/lib/downloadTextFile";

/**
 * Gli otto codici di recupero, mostrati l'unica volta in cui esistono in chiaro: in tabella
 * ne resta solo lo sha256, quindi chiusa questa finestra non sono più recuperabili da
 * nessuno, nemmeno da un amministratore.
 *
 * Da qui la spunta obbligatoria: è l'unico punto dell'app in cui vale la pena mettersi di
 * traverso, perché chi la chiude distrattamente scoprirà di averlo fatto il giorno in cui
 * avrà perso il telefono.
 */
type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    codes: string[];
};

/** Per quanto il pulsante "Copia" resta spuntato: poi torna com'era, pronto per un'altra copia. */
const copiedFeedbackMs = 2000;

/**
 * Un codice per riga, numerato: il file si stampa, e sul foglio si spuntano a penna quelli già
 * usati. Il file contiene segreti, quindi niente nome dell'account né altro che lo leghi a
 * qualcuno.
 */
const buildRecoveryCodesFile = (codes: string[]) =>
    [
        "Codici di recupero: ognuno vale una sola volta.",
        "",
        ...codes.map((code, index) => `${index + 1}. ${code}`),
        "",
    ].join("\n");

const RecoveryCodesDialog = ({ open, onOpenChange, codes }: Props) => {
    const [isSaved, setIsSaved] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        if (!isCopied) {
            return;
        }

        const timer = setTimeout(() => setIsCopied(false), copiedFeedbackMs);
        return () => clearTimeout(timer);
    }, [isCopied]);

    const handleCopyAll = async () => {
        try {
            await navigator.clipboard.writeText(codes.join("\n"));
            setIsCopied(true);
            toast.success("Codici copiati negli appunti");
        } catch {
            toast.error("Impossibile copiare i codici");
        }
    };

    return (
        <CustomDialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    setIsSaved(false);
                    setIsCopied(false);
                }
                onOpenChange(nextOpen);
            }}
            title="Codici di recupero"
            // Breve: l'avviso vero sta nel riquadro giallo qui sotto, ma Radix vuole una
            // descrizione per `aria-describedby`.
            description="Servono a entrare quando non hai con te il telefono."
            contentClassName="sm:max-w-lg"
            showCancelButton={false}
            confirmLabel="Ho salvato i codici, chiudi"
            confirmIcon={Check}
            confirmDisabled={!isSaved}
            onConfirm={() => onOpenChange(false)}
            preventOutsideClose
            content={
                <div className="grid gap-4 pb-2">
                    <SettingsWarningNote title="Li vedi solo ora.">
                        <p>
                            Ognuno vale una volta sola e non verrà mostrato di nuovo. Salvali lontano dal telefono, per
                            esempio in un file o su un foglio.
                        </p>
                    </SettingsWarningNote>

                    {/* Il numero è un elemento a parte: chi copia o seleziona il codice non si porta dietro
                        il "1" davanti, e i codici restano cercabili per testo. */}
                    <ol className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-md border border-primary/15 bg-muted/20 p-3 sm:gap-x-4 sm:p-4">
                        {codes.map((code, index) => (
                            <li key={code} className="flex items-baseline gap-2 sm:gap-3">
                                <span aria-hidden="true" className="w-4 text-right text-sm text-muted-foreground">
                                    {index + 1}
                                </span>
                                <span className="font-mono text-base tracking-wide whitespace-nowrap sm:text-xl sm:tracking-widest">
                                    {code}
                                </span>
                            </li>
                        ))}
                    </ol>

                    <div className="grid gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            className="text-lg"
                            onClick={() => void handleCopyAll()}
                        >
                            {isCopied ? <Check className="size-5" /> : <Copy className="size-5" />}
                            Copia tutti i codici
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            className="text-lg"
                            onClick={() => downloadTextFile("codici-di-recupero.txt", buildRecoveryCodesFile(codes))}
                        >
                            <Download className="size-5" />
                            Scarica .txt
                        </Button>
                    </div>

                    <div className="flex items-center gap-3 rounded-md border border-primary/20 bg-muted/20 p-3">
                        <Checkbox
                            id="recoveryCodesSaved"
                            className="size-5"
                            checked={isSaved}
                            onCheckedChange={(checked) => setIsSaved(Boolean(checked))}
                        />
                        <Label htmlFor="recoveryCodesSaved" className="cursor-pointer text-lg leading-snug font-normal">
                            Ho salvato questi codici in un posto sicuro
                        </Label>
                    </div>
                </div>
            }
        />
    );
};

export default RecoveryCodesDialog;
