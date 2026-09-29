import { type ComponentType, lazy, useEffect, useState } from "react";

/**
 * Un componente caricato pigramente (`lazy`) insieme alla funzione che lo scarica in anticipo.
 *
 * Serve ai dialoghi di creazione e modifica: sono la parte più pesante del codice delle pagine
 * che li usano, e molti li aprono di rado. Scaricati con la pagina ne rallentavano la prima
 * apertura; scaricati solo all'apertura, l'animazione aspetterebbe la rete. Da qui il
 * `prefetch`, da chiamare al passaggio del mouse o al focus sul pulsante che li apre, o a pagina
 * ferma (`usePrefetchWhenIdle`).
 *
 * `lazy` e `prefetch` condividono la stessa richiesta: la seconda chiamata riusa quella in
 * corso invece di aprirne un'altra. Se la richiesta fallisce, la si dimentica, così l'apertura
 * successiva riprova invece di restare sull'errore. L'errore del solo `prefetch` non conta:
 * se il file non arriva, lo richiede `lazy` all'apertura.
 */
export const lazyWithPrefetch = <Props extends object>(load: () => Promise<{ default: ComponentType<Props> }>) => {
    let pending: Promise<{ default: ComponentType<Props> }> | undefined;
    const loadOnce = () =>
        (pending ??= load().catch((error: unknown) => {
            pending = undefined;
            throw error;
        }));

    return {
        Component: lazy(loadOnce),
        prefetch: () => {
            loadOnce().catch(() => undefined);
        },
    };
};

/**
 * Chiama `prefetch` quando il browser non ha altro da fare, dopo il montaggio: a quel punto la
 * pagina è disegnata e lo scaricamento non le toglie niente. `prefetch` deve restare la stessa
 * fra un render e l'altro (una funzione di modulo), altrimenti l'attesa ripartirebbe ogni volta.
 * Dove `requestIdleCallback` manca (Safari meno recenti, jsdom nei test) si aspettano due secondi.
 */
export const usePrefetchWhenIdle = (prefetch: () => void) => {
    useEffect(() => {
        if (typeof window.requestIdleCallback === "function") {
            const handle = window.requestIdleCallback(() => prefetch());
            return () => window.cancelIdleCallback(handle);
        }

        const timeout = window.setTimeout(prefetch, 2000);
        return () => window.clearTimeout(timeout);
    }, [prefetch]);
};

/**
 * Vero dalla prima apertura in poi: il dialogo si monta quando serve la prima volta e poi resta
 * montato, come prima del caricamento pigro. Smontarlo alla chiusura toglierebbe l'animazione
 * di uscita.
 */
export const useHasBeenOpen = (open: boolean) => {
    const [hasBeenOpen, setHasBeenOpen] = useState(open);

    // Lo stato si aggiorna durante il render, come prevede React per uno stato derivato da una
    // prop: con un effetto il dialogo comparirebbe un render più tardi.
    if (open && !hasBeenOpen) {
        setHasBeenOpen(true);
    }

    return hasBeenOpen || open;
};
