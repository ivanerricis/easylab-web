import { useCallback, useState } from "react";
import { getStoredHiddenColumns, setStoredHiddenColumns } from "@/lib/theme";

/**
 * Le colonne che l'utente ha nascosto in una tabella, ricordate per tabella come le larghezze
 * e le righe per pagina (`tableKey` è la stessa chiave).
 */
export const useHiddenColumns = (tableKey: string) => {
    const [hiddenColumnKeys, setHiddenColumnKeys] = useState<string[]>(() => getStoredHiddenColumns(tableKey));

    const setColumnVisible = useCallback(
        (columnKey: string, visible: boolean) => {
            setHiddenColumnKeys((current) => {
                const next = visible
                    ? current.filter((key) => key !== columnKey)
                    : current.includes(columnKey)
                      ? current
                      : [...current, columnKey];

                setStoredHiddenColumns(tableKey, next);
                return next;
            });
        },
        [tableKey]
    );

    const showAllColumns = useCallback(() => {
        setStoredHiddenColumns(tableKey, []);
        setHiddenColumnKeys([]);
    }, [tableKey]);

    return { hiddenColumnKeys, setColumnVisible, showAllColumns };
};
