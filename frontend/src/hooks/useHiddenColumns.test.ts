import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { getStoredHiddenColumns, setStoredHiddenColumns } from "@/lib/theme";
import { useHiddenColumns, withoutLockedColumns } from "./useHiddenColumns";

const columns = [{ key: "id" }, { key: "status", hideable: false }, { key: "password" }];

beforeEach(() => {
    localStorage.clear();
});

describe("withoutLockedColumns", () => {
    it("toglie solo le colonne con hideable: false", () => {
        expect(withoutLockedColumns(["status", "password"], columns)).toEqual(["password"]);
    });
});

describe("useHiddenColumns", () => {
    it("ricorda le colonne nascoste per tabella", () => {
        const { result } = renderHook(() => useHiddenColumns("reports"));

        act(() => {
            result.current.setColumnVisible("password", false);
        });

        expect(result.current.hiddenColumnKeys).toEqual(["password"]);
        expect(getStoredHiddenColumns("reports")).toEqual(["password"]);
    });

    /**
     * Una colonna nascosta prima di diventare non nascondibile (lo "Stato" dei report) non deve
     * restare nascosta per sempre, con la voce del menu bloccata e senza spunta.
     */
    it("con le colonne ignora le nascoste salvate che non si possono nascondere, e alla modifica le ripulisce", () => {
        setStoredHiddenColumns("reports", ["status", "password"]);

        const { result } = renderHook(() => useHiddenColumns("reports", columns));

        expect(result.current.hiddenColumnKeys).toEqual(["password"]);

        act(() => {
            result.current.setColumnVisible("id", false);
        });

        expect(result.current.hiddenColumnKeys).toEqual(["password", "id"]);
        expect(getStoredHiddenColumns("reports")).toEqual(["password", "id"]);
    });

    it("senza le colonne si comporta come prima", () => {
        setStoredHiddenColumns("reports", ["status"]);

        const { result } = renderHook(() => useHiddenColumns("reports"));

        expect(result.current.hiddenColumnKeys).toEqual(["status"]);
    });
});
