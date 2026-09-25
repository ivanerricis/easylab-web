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
    /**
     * Cambia quando cambiano le righe mostrate (di norma l'array delle righe stesso): a ogni
     * cambio la tabella si rimisura e le colonne che ora non bastano si allargano. Vedi
     * `growNaturalWidths`.
     */
    dataVersion?: unknown;
};

/**
 * Misura la larghezza che il browser darebbe alle colonne impaginando la tabella da sé, alla
 * larghezza piena del contenuto.
 *
 * Durante la lettura la tabella viene portata per un istante a `table-layout: auto` e
 * `width: max-content`, senza le larghezze delle `<col>` né il `min-width`, e poi rimessa
 * com'era; tutto in modo sincrono, quindi prima del paint e senza nessun salto visibile.
 * Serve perché la tabella ha `w-full`: in `auto` il browser la stringe dentro il suo
 * contenitore e le colonne che possono restringersi (un nome in `truncate`, una cella con un
 * popover) nascevano già schiacciate, per poi restare così una volta congelate — "Roberto
 * Lombar…" a 768px. A `max-content` ogni colonna misura quello che le serve, qualunque sia la
 * larghezza della finestra; il fatto che così possa lavorare anche su una tabella già a
 * larghezze fisse è ciò che permette di rimisurarla quando cambiano i dati (vedi
 * `useResizableColumns`).
 *
 * Con `fitToContainer`, se a `max-content` la tabella ci sta nel contenitore si rilegge con la
 * sua `w-full`: lì non c'è niente di schiacciato, e il browser distribuisce lo spazio avanzato
 * su tutte le colonne come ha sempre fatto. Senza, su uno schermo largo tutto l'avanzo finiva
 * alla colonna elastica: in Difetti a 1440px "Azioni" larga 667px, con i pulsanti lontani dal
 * resto della riga. Solo per la prima misura: nelle rimisure a crescita (vedi
 * `growNaturalWidths`) le colonne ridistribuite si sommerebbero a quelle già congelate.
 *
 * Torna `null` invece di zeri quando la tabella non è impaginata — nascosta da `sm:table` su
 * mobile, oppure non ancora in pagina: sono i casi in cui congelare le misure vorrebbe dire
 * congelare delle colonne larghe zero.
 */
export const measureNaturalWidths = (
    table: HTMLTableElement,
    columnKeys: string[],
    { fitToContainer = false }: { fitToContainer?: boolean } = {}
): Record<string, number> | null => {
    const headCells = table.tHead?.rows[0]?.cells;

    if (!headCells || headCells.length !== columnKeys.length) {
        return null;
    }

    const cols = Array.from(table.querySelectorAll<HTMLTableColElement>(":scope > colgroup > col"));
    const savedTableStyle = table.style.cssText;
    const savedColWidths = cols.map((col) => col.style.width);

    table.style.tableLayout = "auto";
    table.style.width = "max-content";
    table.style.minWidth = "0";
    cols.forEach((col) => {
        col.style.width = "";
    });

    const readWidths = () => {
        const measured: Record<string, number> = {};

        for (let index = 0; index < columnKeys.length; index += 1) {
            const width = headCells[index].getBoundingClientRect().width;

            if (width <= 0) {
                return null;
            }

            // Per eccesso: con `table-layout: fixed` mezzo pixel in meno basta a far comparire i
            // puntini su un valore che nella misura ci stava per un soffio.
            measured[columnKeys[index]] = Math.ceil(width);
        }

        return measured;
    };

    try {
        const measured = readWidths();
        const containerWidth = table.parentElement?.clientWidth ?? 0;

        if (
            measured &&
            fitToContainer &&
            containerWidth > 0 &&
            Object.values(measured).reduce((total, width) => total + width, 0) <= containerWidth
        ) {
            table.style.width = "";
            return readWidths();
        }

        return measured;
    } finally {
        table.style.cssText = savedTableStyle;
        cols.forEach((col, index) => {
            col.style.width = savedColWidths[index];
        });
    }
};

/**
 * Le nuove misure dopo un cambio di dati: ogni colonna tiene la larghezza più grande fra quella
 * che aveva e quella che le serve ora, e non si stringe mai. Torna `null` se nessuna colonna
 * deve cambiare, così il chiamante non ridisegna niente.
 *
 * Solo in crescita perché la stabilità resta la regola (voce del 2026-09-10): una tabella che
 * si allarga e si stringe a ogni cambio pagina è peggio di una colonna qualche pixel più larga
 * del necessario. Ma una colonna misurata sulla prima pagina non può restare più stretta dei
 * valori delle pagine dopo: gli ID a due cifre della prima pagina di Difetti diventavano "6…"
 * sulla seconda, e "Creato il" perdeva l'ora appena una data aveva una cifra in più.
 */
export const growNaturalWidths = (
    current: Record<string, number>,
    measured: Record<string, number>
): Record<string, number> | null => {
    let changed = false;
    const next = { ...current };

    for (const [columnKey, width] of Object.entries(measured)) {
        if (next[columnKey] === undefined || width > next[columnKey]) {
            next[columnKey] = width;
            changed = true;
        }
    }

    return changed ? next : null;
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
    // Le colonne che ora non si vedono (nascoste dal menu "Colonne") tengono la larghezza che
    // avevano: senza, nasconderne una e poi trascinare un bordo la faceva dimenticare.
    const resolved: Record<string, number> = Object.fromEntries(
        Object.entries(widths).filter(([columnKey]) => !columnKeys.includes(columnKey))
    );

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
 * Si misura solo con `canMeasure`, cioè quando ci sono righe vere. Le misure vengono dalla
 * prima pagina di dati; quando i dati cambiano (`dataVersion`) la tabella si rimisura, ma le
 * colonne possono solo allargarsi: colonne che ballano a ogni cambio pagina sono peggio di
 * colonne un po' larghe, e colonne che troncano i valori delle pagine dopo sono peggio
 * ancora. Vedi `growNaturalWidths`.
 *
 * Al primo trascinamento viene salvato il layout intero e non la sola colonna spostata: vedi
 * `resolveWidthsToPersist` per il perché.
 */
export const useResizableColumns = ({
    tableKey,
    columnKeys,
    elasticColumnKey,
    canMeasure,
    dataVersion,
}: UseResizableColumnsOptions) => {
    const tableRef = useRef<HTMLTableElement>(null);
    const [measuredWidths, setNaturalWidths] = useState<Record<string, number> | null>(null);
    // Una colonna che ricompare dal menu "Colonne" non ha una larghezza naturale: era nascosta
    // quando la tabella è stata misurata. Allora le misure non valgono più, la tabella torna in
    // `table-layout: auto` per un render e si rimisura tutta, come al caricamento dei font (vedi
    // sotto). Le larghezze scelte dall'utente restano in `widths` e hanno la precedenza.
    const naturalWidths =
        measuredWidths &&
        columnKeys.every((columnKey) => columnKey === elasticColumnKey || measuredWidths[columnKey] !== undefined)
            ? measuredWidths
            : null;
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

        const measured = measureNaturalWidths(table, columnKeys, { fitToContainer: true });

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

    // Righe nuove (cambio pagina, ricerca, ordinamento): rimisura in crescita. Si salta quando
    // ogni colonna ha una larghezza scelta dall'utente, perché sarebbe comunque quella a
    // valere; e la prima misura resta al percorso sopra, che parte da una tabella in `auto`.
    const measuredDataVersionRef = useRef<unknown>(undefined);

    useLayoutEffect(() => {
        const table = tableRef.current;
        const previousDataVersion = measuredDataVersionRef.current;

        measuredDataVersionRef.current = dataVersion;

        if (!table || !canMeasure || !naturalWidths || previousDataVersion === dataVersion) {
            return;
        }

        const everyColumnChosen = columnKeys.every(
            (columnKey) => columnKey === elasticColumnKey || widthsRef.current[columnKey] !== undefined
        );

        if (everyColumnChosen) {
            return;
        }

        const measured = measureNaturalWidths(table, columnKeys);
        const grown = measured ? growNaturalWidths(naturalWidths, measured) : null;

        if (grown) {
            applyNaturalWidths(grown);
        }
    }, [applyNaturalWidths, canMeasure, columnKeys, dataVersion, elasticColumnKey, naturalWidths]);

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
