import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { getStoredTableColumnWidths, setStoredTableColumnWidths } from "@/lib/theme";

/** Sotto questa soglia la colonna non è più leggibile e il bordo diventa difficile da riafferrare. */
const minColumnWidth = 56;
/** Quanto sposta il bordo una freccia sinistra/destra sul separatore. */
const keyboardStep = 16;

type UseResizableColumnsOptions = {
    /** Stessa convenzione di `useTableRowsPerPage`: identifica la tabella dentro localStorage. */
    tableKey: string;
    /** Chiavi delle colonne, nell'ordine in cui sono renderizzate. */
    columnKeys: string[];
    /**
     * Colonna che assorbe lo spazio avanzato invece di avere una larghezza propria.
     *
     * Serve perché con `table-layout: fixed` una tabella più larga della somma delle sue
     * colonne distribuisce il resto da sola: senza una colonna elastica dichiarata,
     * restringerne una allargherebbe in modo arbitrario tutte le altre.
     */
    elasticColumnKey?: string;
    /**
     * Se la tabella è nello stato in cui ha senso misurarla, cioè con righe vere sotto le
     * intestazioni. Su una tabella vuota le colonne verrebbero larghe quanto il loro titolo, e
     * all'arrivo dei dati sarebbero tutte troncate.
     */
    canMeasure: boolean;
};

/**
 * Misura la larghezza che il browser ha dato alle colonne impaginando la tabella da sé.
 *
 * Torna `null` invece di zeri quando la tabella non è impaginata — nascosta da `sm:table` su
 * mobile, oppure non ancora in pagina: sono i casi in cui congelare le misure vorrebbe dire
 * congelare delle colonne larghe zero.
 */
const measureNaturalWidths = (table: HTMLTableElement, columnKeys: string[]): Record<string, number> | null => {
    const headCells = table.tHead?.rows[0]?.cells;

    if (!headCells || headCells.length !== columnKeys.length) {
        return null;
    }

    const measured: Record<string, number> = {};

    for (let index = 0; index < columnKeys.length; index += 1) {
        const width = headCells[index].getBoundingClientRect().width;

        if (width <= 0) {
            return null;
        }

        measured[columnKeys[index]] = Math.round(width);
    }

    return measured;
};

/**
 * Il layout completo da salvare: per ogni colonna la larghezza scelta dall'utente, o in sua
 * assenza quella naturale misurata in questo mount.
 *
 * Si salvano anche le colonne mai toccate perché la larghezza naturale non è una costante:
 * la decide il browser sul contenuto della pagina che si sta guardando. Salvando solo le
 * colonne trascinate, al rientro nella scheda tutte le altre venivano rimisurate su righe
 * diverse e cambiavano larghezza da sole — la colonna sistemata restava, il resto della
 * tabella no. Congelare l'intero layout al primo trascinamento è ciò che rende la
 * sistemazione stabile invece che parziale.
 *
 * La colonna elastica resta fuori: non ha una larghezza propria per definizione, prende
 * quello che avanza.
 */
export const resolveWidthsToPersist = (
    columnKeys: string[],
    naturalWidths: Record<string, number> | null,
    widths: Record<string, number>,
    elasticColumnKey?: string
): Record<string, number> => {
    const resolved: Record<string, number> = {};

    for (const columnKey of columnKeys) {
        if (columnKey === elasticColumnKey) {
            continue;
        }

        const width = widths[columnKey] ?? naturalWidths?.[columnKey];

        if (width !== undefined) {
            resolved[columnKey] = width;
        }
    }

    return resolved;
};

/**
 * Colonne trascinabili per il bordo destro dell'intestazione.
 *
 * Il punto delicato è che finché la tabella è in `table-layout: auto` — com'è oggi — le
 * larghezze non esistono: le decide il browser dal contenuto a ogni render. Trascinare un
 * bordo richiede invece larghezze esplicite, quindi `table-layout: fixed`.
 *
 * Per non cambiare l'aspetto delle tabelle a chi non trascina niente, le larghezze di
 * partenza non sono inventate: si lascia fare il primo render in `auto`, si misura quello che
 * il browser ha deciso e solo allora si passa a `fixed` con quelle stesse misure. La misura
 * avviene in `useLayoutEffect`, cioè prima del paint, quindi non si vede nessun salto.
 *
 * Si misura solo con `canMeasure`, cioè quando ci sono righe vere. Come contropartita le
 * misure vengono dalla prima pagina di dati e poi restano ferme — che è anche il
 * comportamento voluto, perché colonne che ballano a ogni cambio pagina sono peggio di
 * colonne strette.
 *
 * Al primo trascinamento viene salvato il layout intero e non la sola colonna spostata: vedi
 * `resolveWidthsToPersist` per il perché.
 */
export const useResizableColumns = ({
    tableKey,
    columnKeys,
    elasticColumnKey,
    canMeasure,
}: UseResizableColumnsOptions) => {
    const tableRef = useRef<HTMLTableElement>(null);
    const [naturalWidths, setNaturalWidths] = useState<Record<string, number> | null>(null);
    const [widths, setWidths] = useState<Record<string, number>>(() => getStoredTableColumnWidths(tableKey));

    // Le larghezze naturali servono anche fuori dal render (al salvataggio e al termine del
    // caricamento dei font), dove lo stato React sarebbe quello dell'ultimo render.
    const naturalWidthsRef = useRef(naturalWidths);

    const applyNaturalWidths = useCallback((nextNaturalWidths: Record<string, number> | null) => {
        naturalWidthsRef.current = nextNaturalWidths;
        setNaturalWidths(nextNaturalWidths);
    }, []);

    // Durante il trascinamento lo stato React non è abbastanza fresco: ogni pointermove deve
    // partire dal valore appena scritto, non da quello dell'ultimo render.
    const widthsRef = useRef(widths);

    const dragRef = useRef<{ columnKey: string; startX: number; startWidth: number } | null>(null);

    const hasRemeasuredForFontsRef = useRef(false);

    /**
     * Misurare mentre Inter sta ancora caricando dà le larghezze del font di ripiego, più
     * stretto: le colonne resterebbero congelate su quelle misure e il testo — con
     * `table-layout: fixed` ormai attivo — troncato per sempre. Al primo accesso
     * "Data/Orario" nasceva così a 178px invece dei 186px che le servono.
     *
     * `document.fonts.ready` non serve a niente qui, perché si risolve appena non c'è nessun
     * caricamento in corso e Inter parte solo quando la tabella disegna il primo testo:
     * misurato, `ready` si risolve a 919ms mentre il font carica tra 3988ms e 4196ms, con la
     * misurazione nel mezzo. L'unico segnale affidabile è `loadingdone`.
     *
     * Azzerare le larghezze naturali rimanda la tabella in `table-layout: auto` per un render
     * — è l'unico modo di rimisurare, perché una tabella già a larghezze fisse restituirebbe
     * quelle stesse larghezze — e fa ripartire la misurazione con il font vero. Le larghezze
     * scelte dall'utente non si perdono: vivono in `widths` e hanno comunque la precedenza.
     */
    useEffect(() => {
        const fontSet = document.fonts;

        if (!fontSet) {
            return;
        }

        const handleFontsLoaded = () => {
            // `loadingdone` si ripete a ogni faccia che finisce di caricare (i sottoinsiemi
            // Unicode di Inter arrivano quando compare il primo carattere che li richiede).
            // Rimisurare ogni volta rifaceva il layout su righe diverse da quelle di prima e
            // le colonne si spostavano sotto le mani di chi stava leggendo: la rimisurazione
            // serve una volta sola, per correggere quella fatta con il font di ripiego.
            if (hasRemeasuredForFontsRef.current || naturalWidthsRef.current === null) {
                return;
            }

            hasRemeasuredForFontsRef.current = true;
            applyNaturalWidths(null);
        };

        fontSet.addEventListener("loadingdone", handleFontsLoaded);

        return () => fontSet.removeEventListener("loadingdone", handleFontsLoaded);
    }, [applyNaturalWidths]);

    const tryMeasure = useCallback(() => {
        const table = tableRef.current;

        if (!table) {
            return;
        }

        const measured = measureNaturalWidths(table, columnKeys);

        if (measured) {
            applyNaturalWidths(measured);
        }
    }, [applyNaturalWidths, columnKeys]);

    useLayoutEffect(() => {
        if (naturalWidths || !canMeasure) {
            return;
        }

        tryMeasure();
    });

    // La tabella può diventare misurabile senza che React ri-renderizzi: basta allargare la
    // finestra oltre `sm`, dove fino a un attimo prima c'erano le schede al suo posto.
    useEffect(() => {
        const table = tableRef.current;

        if (naturalWidths || !canMeasure || !table || typeof ResizeObserver === "undefined") {
            return;
        }

        const observer = new ResizeObserver(() => tryMeasure());
        observer.observe(table);

        return () => observer.disconnect();
    }, [canMeasure, naturalWidths, tryMeasure]);

    const getColumnWidth = useCallback(
        (columnKey: string) => {
            if (!naturalWidths || columnKey === elasticColumnKey) {
                return undefined;
            }

            return widths[columnKey] ?? naturalWidths[columnKey];
        },
        [elasticColumnKey, naturalWidths, widths]
    );

    const applyWidth = useCallback((columnKey: string, width: number) => {
        const nextWidths = { ...widthsRef.current, [columnKey]: Math.max(minColumnWidth, Math.round(width)) };

        widthsRef.current = nextWidths;
        setWidths(nextWidths);
    }, []);

    const persistWidths = useCallback(() => {
        setStoredTableColumnWidths(
            tableKey,
            resolveWidthsToPersist(columnKeys, naturalWidthsRef.current, widthsRef.current, elasticColumnKey)
        );
    }, [columnKeys, elasticColumnKey, tableKey]);

    /**
     * Props della maniglia, o `null` quando la colonna non è ridimensionabile: prima della
     * misurazione, perché non c'è ancora una larghezza da cui partire, e sulla colonna
     * elastica, che per definizione prende quello che avanza.
     */
    const getResizeHandleProps = useCallback(
        (columnKey: string, columnLabel: string) => {
            if (!naturalWidths || columnKey === elasticColumnKey) {
                return null;
            }

            const currentWidth = () => widthsRef.current[columnKey] ?? naturalWidths[columnKey];

            return {
                role: "separator" as const,
                "aria-orientation": "vertical" as const,
                "aria-label": `Ridimensiona colonna ${columnLabel}`,
                tabIndex: 0,
                onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
                    if (event.button !== 0) {
                        return;
                    }

                    // Senza questo il trascinamento seleziona il testo dell'intestazione.
                    event.preventDefault();
                    event.stopPropagation();

                    dragRef.current = { columnKey, startX: event.clientX, startWidth: currentWidth() };
                    event.currentTarget.setPointerCapture(event.pointerId);
                },
                onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
                    const drag = dragRef.current;

                    if (!drag) {
                        return;
                    }

                    applyWidth(drag.columnKey, drag.startWidth + event.clientX - drag.startX);
                },
                onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
                    if (!dragRef.current) {
                        return;
                    }

                    dragRef.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    // Si scrive su localStorage a fine trascinamento, non a ogni pixel.
                    persistWidths();
                },
                onPointerCancel: () => {
                    if (!dragRef.current) {
                        return;
                    }

                    dragRef.current = null;
                    persistWidths();
                },
                onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                        return;
                    }

                    event.preventDefault();
                    applyWidth(columnKey, currentWidth() + (event.key === "ArrowLeft" ? -keyboardStep : keyboardStep));
                    persistWidths();
                },
                onDoubleClick: (event: ReactPointerEvent<HTMLElement>) => {
                    event.stopPropagation();

                    // Torna alla larghezza naturale togliendo la voce scelta dall'utente: la
                    // colonna ricade sulla misura presa in questo mount, che il salvataggio
                    // successivo congela insieme al resto del layout. Un secondo doppio click,
                    // più avanti, la riporta alla naturale di allora.
                    const nextWidths = { ...widthsRef.current };

                    delete nextWidths[columnKey];
                    widthsRef.current = nextWidths;
                    setWidths(nextWidths);
                    persistWidths();
                },
            };
        },
        [applyWidth, elasticColumnKey, naturalWidths, persistWidths]
    );

    /**
     * `minWidth` è la somma delle colonne: sotto quella soglia la tabella non si comprime e va
     * in scroll orizzontale dentro il contenitore. Sopra, l'eccedenza la prende la colonna
     * elastica.
     */
    const tableStyle = useMemo<CSSProperties | undefined>(() => {
        if (!naturalWidths) {
            return undefined;
        }

        const totalWidth = columnKeys.reduce(
            (total, columnKey) => total + (widths[columnKey] ?? naturalWidths[columnKey] ?? 0),
            0
        );

        return { tableLayout: "fixed", minWidth: totalWidth };
    }, [columnKeys, naturalWidths, widths]);

    return {
        tableRef,
        /** `false` finché le larghezze naturali non sono note: la tabella resta com'è oggi. */
        isResizable: naturalWidths !== null,
        getColumnWidth,
        getResizeHandleProps,
        tableStyle,
    };
};
