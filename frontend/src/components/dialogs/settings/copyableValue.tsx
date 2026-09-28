import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import FormField from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Un valore che l'app mostra una volta sola e che va portato via: una password generata, il
 * segreto di un'app di autenticazione, un blocco di codici di recupero.
 *
 * Estratto perché ricopiare a mano una stringa di sedici caratteri da uno schermo è il modo
 * più affidabile di sbagliarla, e la stessa coppia campo-più-bottone serviva ormai in tre
 * punti diversi delle impostazioni.
 */
type Props = {
    id: string;
    label: string;
    value: string;
    /** Nel toast: il valore ha un genere e un numero che il messaggio deve rispettare. */
    copiedMessage: string;
    errorMessage: string;
};

const CopyableValue = ({ id, label, value, copiedMessage, errorMessage }: Props) => {
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setIsCopied(true);
            toast.success(copiedMessage);
        } catch {
            // Gli appunti sono negati senza HTTPS o senza permesso: il valore resta comunque
            // selezionabile a mano nel campo, quindi non è un vicolo cieco.
            toast.error(errorMessage);
        }
    };

    return (
        <FormField id={id} label={label}>
            <div className="flex gap-2">
                <Input id={id} readOnly value={value} className="font-mono" />
                <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    onClick={() => void handleCopy()}
                    aria-label={`Copia ${label.toLowerCase()}`}
                >
                    {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
            </div>
        </FormField>
    );
};

export default CopyableValue;
