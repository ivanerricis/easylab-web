import Kbd from "@/components/ui/kbd";
import { getStoredKeyboardShortcutsEnabled } from "@/lib/theme";

type ShortcutKeysProps = {
    /** I tasti, nell'ordine in cui si premono: `["n"]`, `[modifierKey, "K"]`. */
    keys: string[];
    /**
     * Una scorciatoia a un tasto ("n", "/", "r"): si spegne in Impostazioni › Aspetto, e da
     * spenta non va suggerita. Le combinazioni con Ctrl restano sempre attive (vedi `usePageShortcut`).
     */
    singleKey?: boolean;
};

/**
 * La scorciatoia di un pulsante, in coda al testo del suo suggerimento: "Crea nuovo cliente n".
 * Prima le scorciatoie si scoprivano solo dall'elenco aperto con "?"; così chi passa con il
 * mouse sul pulsante le vede dove servono.
 *
 * La preferenza si legge a ogni apertura del suggerimento (il contenuto si monta all'apertura),
 * quindi segue subito un cambio fatto in Impostazioni.
 */
const ShortcutKeys = ({ keys, singleKey = false }: ShortcutKeysProps) => {
    if (singleKey && !getStoredKeyboardShortcutsEnabled()) {
        return null;
    }

    return (
        <span className="ml-2 inline-flex items-center gap-1" aria-hidden="true">
            {keys.map((key) => (
                // Sul fondo scuro del suggerimento il tastino grigio dell'app non si leggeva:
                // qui prende il colore del testo, con fondo e bordo trasparenti.
                <Kbd key={key} className="border-current/30 bg-transparent text-current">
                    {key}
                </Kbd>
            ))}
        </span>
    );
};

export default ShortcutKeys;
