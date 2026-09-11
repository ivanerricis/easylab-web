import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import CustomDialog from "@/components/dialogs/customDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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

const RecoveryCodesDialog = ({ open, onOpenChange, codes }: Props) => {
    const [isSaved, setIsSaved] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

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
            description="Servono a entrare quando non hai con te il telefono. Ognuno vale una volta sola, e non verranno mostrati di nuovo: stampali o salvali in un posto sicuro, lontano dal telefono stesso."
            showCancelButton={false}
            confirmLabel="Ho salvato i codici, chiudi"
            confirmIcon={Check}
            confirmDisabled={!isSaved}
            onConfirm={() => onOpenChange(false)}
            preventOutsideClose
            content={
                <div className="grid gap-3 py-2">
                    <div className="grid grid-cols-2 gap-2 rounded-md border border-primary/15 bg-muted/20 p-3">
                        {codes.map((code) => (
                            <span key={code} className="text-center font-mono text-sm tracking-wider">
                                {code}
                            </span>
                        ))}
                    </div>

                    <Button type="button" variant="outline" onClick={() => void handleCopyAll()}>
                        {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                        Copia tutti i codici
                    </Button>

                    <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-muted/20 p-3">
                        <Checkbox
                            id="recoveryCodesSaved"
                            checked={isSaved}
                            onCheckedChange={(checked) => setIsSaved(Boolean(checked))}
                        />
                        <Label htmlFor="recoveryCodesSaved" className="cursor-pointer text-sm leading-snug font-normal">
                            Ho salvato questi codici in un posto sicuro
                        </Label>
                    </div>
                </div>
            }
        />
    );
};

export default RecoveryCodesDialog;
