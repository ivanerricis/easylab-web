import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router-dom";
import { getListScrollContainers } from "@/lib/listScroll";

const storageKey = "list-scroll-positions";
/** Quante posizioni tenere: bastano per qualche "Indietro" di fila, senza crescere per sempre. */
const maxStoredPositions = 50;

type StoredPositions = Record<string, number[]>;

const readPositions = (): StoredPositions => {
    try {
        return JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as StoredPositions;
    } catch {
        return {};
    }
};

const writePosition = (key: string, offsets: number[]) => {
    try {
        const positions = readPositions();
        // Tolta e rimessa, la chiave torna in fondo: quelle in testa sono le più vecchie.
        delete positions[key];
        positions[key] = offsets;

        const keys = Object.keys(positions);
        for (const oldKey of keys.slice(0, Math.max(0, keys.length - maxStoredPositions))) {
            delete positions[oldKey];
        }

        sessionStorage.setItem(storageKey, JSON.stringify(positions));
    } catch {
        // Senza sessionStorage (finestra privata, dati bloccati) si torna in cima come prima.
    }
};

type UseListScrollRestorationOptions = {
    /** Un elemento dentro il contenitore della tabella: da lì si risale ai contenitori che scorrono. */
    anchorRef: RefObject<Element | null>;
    tableKey: string;
    /** Vero quando le righe sono in pagina: prima non c'è un'altezza a cui tornare. */
    isReady: boolean;
};

/**
 * Riporta una lista dov'era quando ci si torna con "Indietro": aprire un cliente dalla lista
 * dei report e tornare indietro rimetteva la lista in cima, e chi era sceso fino al report
 * doveva ritrovarlo a mano.
 *
 * Il browser lo farebbe da sé solo per lo scroll della finestra, e React Router
 * (`ScrollRestoration`) pure: qui invece scorrono dei contenitori, vedi
 * `getListScrollContainers`. Le posizioni si salvano a ogni scroll, non all'uscita dalla
 * pagina: allo smontaggio gli elementi sono già staccati e leggerebbero zero.
 *
 * La chiave è `location.key`, che la cronologia conserva: "Indietro" ritrova la stessa voce,
 * mentre un link nuovo alla lista ne ha una diversa e parte giustamente dall'inizio.
 */
export const useListScrollRestoration = ({ anchorRef, tableKey, isReady }: UseListScrollRestorationOptions) => {
    const location = useLocation();
    // L'indirizzo accanto alla chiave: la prima voce della cronologia ha sempre `key` "default",
    // e da sola farebbe ritrovare a una lista aperta da zero la posizione di un'altra.
    const positionKey = `${location.key}:${location.pathname}${location.search}:${tableKey}`;
    const positionKeyRef = useRef(positionKey);
    const hasRestoredRef = useRef(false);

    useLayoutEffect(() => {
        positionKeyRef.current = positionKey;
    }, [positionKey]);

    useLayoutEffect(() => {
        if (!isReady || hasRestoredRef.current) {
            return;
        }

        hasRestoredRef.current = true;
        const offsets = readPositions()[positionKeyRef.current];

        if (offsets) {
            getListScrollContainers(anchorRef.current?.parentElement ?? null).forEach((container, index) => {
                container.scrollTop = offsets[index] ?? 0;
            });
        }
    }, [anchorRef, isReady]);

    useEffect(() => {
        const containers = getListScrollContainers(anchorRef.current?.parentElement ?? null);
        let frame = 0;

        const save = () => {
            // Finché la posizione salvata non è stata rimessa, uno scroll (anche solo il
            // contenitore che si accorcia sotto lo scheletro di caricamento) la cancellerebbe.
            if (!hasRestoredRef.current || frame) {
                return;
            }

            frame = requestAnimationFrame(() => {
                frame = 0;
                writePosition(
                    positionKeyRef.current,
                    containers.map((container) => container.scrollTop)
                );
            });
        };

        containers.forEach((container) => container.addEventListener("scroll", save, { passive: true }));

        return () => {
            cancelAnimationFrame(frame);
            containers.forEach((container) => container.removeEventListener("scroll", save));
        };
    }, [anchorRef]);
};
