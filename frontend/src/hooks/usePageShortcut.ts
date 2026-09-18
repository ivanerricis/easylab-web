import { useEffect, useEffectEvent } from "react";

/**
 * Gli strati che si aprono sopra la pagina e in cui una lettera ha già un significato: in un
 * dialogo si sta compilando un campo, e nei menu e nelle tendine Radix usa le lettere per
 * saltare alla voce che inizia così.
 *
 * Il riconoscimento è sul ruolo e non sul nome del componente: Radix mette `dialog` su finestre,
 * pannelli laterali e popover, `menu` sui menu e `listbox` sulle tendine, quindi un primitivo
 * nuovo è già coperto senza aggiungerlo a un elenco che nessuno si ricorderebbe di aggiornare.
 * Il tooltip resta fuori da sé, che ha ruolo `tooltip`: compare passandoci sopra col mouse, non
 * prende il focus, e non deve spegnere le scorciatoie.
 */
const blockingRoles = '[role="dialog"], [role="menu"], [role="listbox"]';

/**
 * Le scorciatoie a lettera nuda delle pagine a elenco: "/" porta il focus sulla ricerca, "n"
 * apre il dialogo di creazione. Sono lettere nude perché i browser si tengono le combinazioni
 * con Ctrl: Ctrl+N apre una finestra nuova e la pagina non lo vede nemmeno, `preventDefault`
 * compreso. È anche quello che fanno GitHub, Linear e Gmail.
 *
 * Il tasto resta senza effetto mentre si scrive — in un campo, in un'area di testo, in un
 * elemento modificabile — e mentre il focus è dentro uno strato che le lettere se le tiene.
 */
export const usePageShortcut = (key: string, onTrigger: () => void) => {
    // Un evento e non una dipendenza: chi chiama passa una funzione scritta sul posto, nuova a
    // ogni render, e l'ascoltatore non deve staccarsi e riattaccarsi per questo.
    const trigger = useEffectEvent(onTrigger);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== key || event.ctrlKey || event.metaKey || event.altKey) {
                return;
            }

            const active = document.activeElement;
            const isTypingElsewhere =
                active instanceof HTMLElement &&
                (active.tagName === "INPUT" ||
                    active.tagName === "TEXTAREA" ||
                    active.tagName === "SELECT" ||
                    active.isContentEditable);

            if (isTypingElsewhere || active?.closest(blockingRoles)) {
                return;
            }

            event.preventDefault();
            trigger();
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [key]);
};
