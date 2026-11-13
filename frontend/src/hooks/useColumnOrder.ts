import { useCallback, useMemo, useState } from "react";
import { getStoredColumnOrder, setStoredColumnOrder } from "@/lib/theme";

type OrderableColumn = { key: string };

/** La colonna dei pulsanti di riga: resta sempre in fondo e non si sposta. */
const actionsColumnKey = "actions";

/**
 * Applica un ordine salvato alle colonne di oggi, restituendo le chiavi nell'ordine finale.
 *
 * Le chiavi salvate che non esistono più si ignorano. Una colonna comparsa dopo il salvataggio
 * non c'è nell'ordine salvato e non va in fondo: si mette subito dopo la colonna che la precede
 * nel predefinito, così resta vicina alle sue vicine di sempre. `actions` chiude sempre.
 */
export const resolveColumnOrder = (columns: readonly OrderableColumn[], storedKeys: readonly string[]): string[] => {
    const defaultKeys = columns.map((column) => column.key).filter((key) => key !== actionsColumnKey);
    const knownKeys = new Set(defaultKeys);
    const ordered = [...new Set(storedKeys)].filter((key) => knownKeys.has(key));
    const placedKeys = new Set(ordered);

    defaultKeys.forEach((key, defaultIndex) => {
        if (placedKeys.has(key)) {
            return;
        }

        // Le colonne nuove consecutive si agganciano una dopo l'altra: la precedente nel
        // predefinito è già stata sistemata quando si arriva alla successiva.
        const precedingIndex = defaultIndex > 0 ? ordered.indexOf(defaultKeys[defaultIndex - 1]) : -1;

        ordered.splice(precedingIndex + 1, 0, key);
        placedKeys.add(key);
    });

    return columns.some((column) => column.key === actionsColumnKey) ? [...ordered, actionsColumnKey] : ordered;
};

/**
 * L'ordine delle colonne di una tabella scelto dall'utente, ricordato per tabella come le
 * larghezze e le colonne nascoste (`tableKey` è la stessa chiave).
 *
 * `orderedColumns` ha lo stesso riferimento finché non cambiano le colonne o l'ordine: le righe
 * di `EntityTable` sono in `memo` e confrontano `columns`, quindi un array nuovo a ogni render
 * le ridisegnerebbe tutte. Gli indici di `moveColumn` valgono sull'elenco completo, nascoste
 * comprese, lo stesso che mostra il menu "Colonne".
 */
export const useColumnOrder = <TColumn extends OrderableColumn>(tableKey: string, columns: readonly TColumn[]) => {
    const defaultKeys = useMemo(
        () => resolveColumnOrder(columns, []).filter((key) => key !== actionsColumnKey),
        [columns]
    );
    const [storedKeys, setStoredKeys] = useState<string[]>(() => getStoredColumnOrder(tableKey));

    const orderedKeys = useMemo(() => resolveColumnOrder(columns, storedKeys), [columns, storedKeys]);
    const orderedColumns = useMemo(() => {
        const columnByKey = new Map(columns.map((column) => [column.key, column]));

        return orderedKeys.map((key) => columnByKey.get(key) as TColumn);
    }, [columns, orderedKeys]);
    const isCustomOrder = useMemo(
        () => orderedKeys.filter((key) => key !== actionsColumnKey).some((key, index) => key !== defaultKeys[index]),
        [defaultKeys, orderedKeys]
    );

    const moveColumn = useCallback(
        (columnKey: string, toIndex: number) => {
            setStoredKeys((stored) => {
                const current = resolveColumnOrder(columns, stored).filter((key) => key !== actionsColumnKey);
                const fromIndex = current.indexOf(columnKey);

                if (fromIndex === -1) {
                    return stored;
                }

                // `toIndex` è la posizione finale: mai oltre l'ultima colonna dati, cioè mai dopo `actions`.
                const targetIndex = Math.min(Math.max(toIndex, 0), current.length - 1);

                if (targetIndex === fromIndex) {
                    return stored;
                }

                const next = [...current];

                next.splice(fromIndex, 1);
                next.splice(targetIndex, 0, columnKey);
                setStoredColumnOrder(tableKey, next, defaultKeys);

                return next;
            });
        },
        [columns, defaultKeys, tableKey]
    );

    const moveColumnBy = useCallback(
        (columnKey: string, delta: number) => {
            const currentIndex = orderedKeys.indexOf(columnKey);

            if (currentIndex === -1 || columnKey === actionsColumnKey) {
                return;
            }

            moveColumn(columnKey, currentIndex + delta);
        },
        [moveColumn, orderedKeys]
    );

    const resetColumnOrder = useCallback(() => {
        setStoredColumnOrder(tableKey, [], defaultKeys);
        setStoredKeys([]);
    }, [defaultKeys, tableKey]);

    return { orderedColumns, moveColumn, moveColumnBy, resetColumnOrder, isCustomOrder };
};
