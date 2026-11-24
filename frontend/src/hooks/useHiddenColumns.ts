import { useCallback, useMemo, useState } from "react";
import { getStoredHiddenColumns, setStoredHiddenColumns } from "@/lib/theme";

type HideableColumn = { key: string; hideable?: boolean; hiddenByDefault?: boolean };

/**
 * Toglie dalle colonne nascoste quelle che non si possono nascondere (`hideable: false`).
 *
 * Servono perché una colonna può diventare non nascondibile dopo che qualcuno l'aveva già
 * nascosta: è successo allo "Stato" dei report, bloccato perché lo stato non restasse affidato
 * al solo colore della riga. Chi l'aveva tolta prima se la ritrovava nascosta per sempre, con la
 * voce del menu "Colonne" bloccata e senza spunta: nessun modo di riaverla se non "Mostra tutte".
 * Usata sia qui sia da `EntityTable`, che la applica comunque a ciò che riceve.
 */
export const withoutLockedColumns = (
    hiddenColumnKeys: readonly string[],
    columns: readonly HideableColumn[]
): string[] => {
    const lockedKeys = new Set(columns.filter((column) => column.hideable === false).map((column) => column.key));

    return hiddenColumnKeys.filter((key) => !lockedKeys.has(key));
};

const actionsColumnKey = "actions";

/**
 * Nelle preferenze salvate i pulsanti di riga sono nascosti di default: le liste salvate prima che
 * si potessero nascondere non nominano `actions`, e valgono "nascosta" invece di forzarla visibile.
 * Per ricordare la scelta contraria (la colonna mostrata) si salva questo segnaposto al suo posto.
 */
const actionsShownMarker = "!actions";

/** Dalle chiavi salvate alle colonne nascoste davvero (con `actions` se non è segnata come mostrata). */
const decodeActionsVisibility = (storedKeys: string[], hasActionsColumn: boolean): string[] => {
    if (!hasActionsColumn) {
        return storedKeys.filter((key) => key !== actionsShownMarker);
    }

    const withoutMarker = storedKeys.filter((key) => key !== actionsShownMarker);

    return storedKeys.includes(actionsShownMarker) || withoutMarker.includes(actionsColumnKey)
        ? withoutMarker
        : [...withoutMarker, actionsColumnKey];
};

/** L'inverso di `decodeActionsVisibility`, per salvare. */
const encodeActionsVisibility = (hiddenKeys: string[], hasActionsColumn: boolean): string[] =>
    hasActionsColumn && !hiddenKeys.includes(actionsColumnKey) ? [...hiddenKeys, actionsShownMarker] : hiddenKeys;

/**
 * Le colonne che l'utente ha nascosto in una tabella, ricordate per tabella come le larghezze
 * e le righe per pagina (`tableKey` è la stessa chiave).
 *
 * Con `columns` le colonne non nascondibili non risultano mai nascoste, anche se lo erano nelle
 * preferenze salvate (vedi `withoutLockedColumns`): così anche il menu "Colonne" le mostra
 * spuntate e il conteggio delle nascoste non le conta. La preferenza salvata si ripulisce alla
 * prossima modifica. Facoltativo: senza, si comporta come prima.
 */
export const useHiddenColumns = (tableKey: string, columns?: readonly HideableColumn[]) => {
    const hasActionsColumn = (columns ?? []).some((column) => column.key === actionsColumnKey);
    // Le colonne nascoste finché l'utente non sceglie diversamente (`hiddenByDefault`), più i
    // pulsanti di riga: ci sono già nel menu col tasto destro, e a destra nelle tabelle larghe
    // finivano fuori vista (vedi `actionsShownMarker`).
    const defaultHiddenKeys = useMemo(
        () => [
            ...(columns ?? []).filter((column) => column.hiddenByDefault).map((column) => column.key),
            ...(hasActionsColumn ? [actionsColumnKey] : []),
        ],
        [columns, hasActionsColumn]
    );
    const [storedHiddenColumnKeys, setHiddenColumnKeys] = useState<string[]>(() =>
        decodeActionsVisibility(getStoredHiddenColumns(tableKey, defaultHiddenKeys), hasActionsColumn)
    );
    const hiddenColumnKeys = useMemo(
        () => (columns ? withoutLockedColumns(storedHiddenColumnKeys, columns) : storedHiddenColumnKeys),
        [columns, storedHiddenColumnKeys]
    );

    const setColumnVisible = useCallback(
        (columnKey: string, visible: boolean) => {
            setHiddenColumnKeys((stored) => {
                const current = columns ? withoutLockedColumns(stored, columns) : stored;
                const next = visible
                    ? current.filter((key) => key !== columnKey)
                    : current.includes(columnKey)
                      ? current
                      : [...current, columnKey];

                setStoredHiddenColumns(tableKey, encodeActionsVisibility(next, hasActionsColumn), defaultHiddenKeys);
                return next;
            });
        },
        [columns, defaultHiddenKeys, hasActionsColumn, tableKey]
    );

    const showAllColumns = useCallback(() => {
        setStoredHiddenColumns(tableKey, encodeActionsVisibility([], hasActionsColumn), defaultHiddenKeys);
        setHiddenColumnKeys([]);
    }, [defaultHiddenKeys, hasActionsColumn, tableKey]);

    return { hiddenColumnKeys, setColumnVisible, showAllColumns };
};
