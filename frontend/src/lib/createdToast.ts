import { toast } from "sonner";

type CreatedToastOptions = {
    /** Es. "Report #123 creato". */
    message: string;
    onOpen: () => void;
    onPrint: () => void;
};

/**
 * L'avviso dopo la creazione di un report o di un intervento, con le due cose che si fanno
 * più spesso subito dopo: aprirne la scheda o stamparlo.
 *
 * Prima c'era un `window.confirm("Vuoi stamparlo adesso?")`: la finestra del browser, con un
 * aspetto diverso dal resto dell'app, che bloccava la pagina finché non si rispondeva e non
 * offriva di aprire la scheda. L'avviso invece non blocca niente: chi non vuole stampare lo
 * ignora e sparisce da solo. Resta più a lungo degli altri (10 secondi, e si ferma con il
 * mouse sopra) perché contiene azioni, non solo un'informazione.
 *
 * La stampa parte dal clic sul pulsante, quindi il browser non blocca la finestra che apre.
 */
export const showCreatedToast = ({ message, onOpen, onPrint }: CreatedToastOptions) =>
    toast.success(message, {
        duration: 10_000,
        action: { label: "Stampa", onClick: onPrint },
        cancel: { label: "Apri", onClick: onOpen },
    });
