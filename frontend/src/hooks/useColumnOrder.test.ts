import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { getStoredColumnOrder, setStoredColumnOrder } from "@/lib/theme";
import { useColumnOrder } from "./useColumnOrder";

const columns = [{ key: "id" }, { key: "name" }, { key: "email" }, { key: "phone" }, { key: "actions" }];

const orderedKeys = (result: { current: { orderedColumns: { key: string }[] } }) =>
    result.current.orderedColumns.map((column) => column.key);

beforeEach(() => {
    localStorage.clear();
});

describe("useColumnOrder", () => {
    it("senza scelta salvata tiene l'ordine predefinito", () => {
        const { result } = renderHook(() => useColumnOrder("t", columns));

        expect(orderedKeys(result)).toEqual(["id", "name", "email", "phone", "actions"]);
        expect(result.current.isCustomOrder).toBe(false);
    });

    it("applica l'ordine salvato e lo ricorda per tabella", () => {
        setStoredColumnOrder("t", ["phone", "id", "name", "email"]);

        const { result } = renderHook(() => useColumnOrder("t", columns));
        const other = renderHook(() => useColumnOrder("altra", columns));

        expect(orderedKeys(result)).toEqual(["phone", "id", "name", "email", "actions"]);
        expect(result.current.isCustomOrder).toBe(true);
        expect(orderedKeys(other.result)).toEqual(["id", "name", "email", "phone", "actions"]);
    });

    it("ignora le colonne salvate che non esistono più", () => {
        setStoredColumnOrder("t", ["gone", "email", "id", "name", "phone"]);

        const { result } = renderHook(() => useColumnOrder("t", columns));

        expect(orderedKeys(result)).toEqual(["email", "id", "name", "phone", "actions"]);
    });

    it("rimette una colonna nuova dopo quella che la precede nel predefinito", () => {
        // `name` e `phone` non c'erano quando l'ordine è stato salvato.
        setStoredColumnOrder("t", ["email", "id"]);

        const { result } = renderHook(() => useColumnOrder("t", columns));

        // `name` segue `id` e `phone` segue `email`, le colonne che le precedono nel predefinito.
        expect(orderedKeys(result)).toEqual(["email", "phone", "id", "name", "actions"]);
    });

    it("una colonna nuova in testa al predefinito resta in testa", () => {
        setStoredColumnOrder("t", ["phone", "email", "name"]);

        const { result } = renderHook(() => useColumnOrder("t", columns));

        expect(orderedKeys(result)).toEqual(["id", "phone", "email", "name", "actions"]);
    });

    it("tiene sempre actions in fondo, anche se salvata altrove", () => {
        setStoredColumnOrder("t", ["actions", "phone", "id", "name", "email"]);

        const { result } = renderHook(() => useColumnOrder("t", columns));

        expect(orderedKeys(result).at(-1)).toBe("actions");
    });

    it("moveColumn porta la colonna alla posizione finale e salva", () => {
        const { result } = renderHook(() => useColumnOrder("t", columns));

        act(() => result.current.moveColumn("phone", 0));

        expect(orderedKeys(result)).toEqual(["phone", "id", "name", "email", "actions"]);
        expect(getStoredColumnOrder("t")).toEqual(["phone", "id", "name", "email"]);
        expect(result.current.isCustomOrder).toBe(true);

        act(() => result.current.moveColumn("phone", 2));

        expect(orderedKeys(result)).toEqual(["id", "name", "phone", "email", "actions"]);
    });

    it("non sposta actions né porta una colonna dopo di lei", () => {
        const { result } = renderHook(() => useColumnOrder("t", columns));

        act(() => result.current.moveColumn("actions", 0));
        expect(orderedKeys(result)).toEqual(["id", "name", "email", "phone", "actions"]);

        act(() => result.current.moveColumn("id", 99));
        expect(orderedKeys(result)).toEqual(["name", "email", "phone", "id", "actions"]);
    });

    it("moveColumnBy ai bordi non fa niente", () => {
        const { result } = renderHook(() => useColumnOrder("t", columns));

        act(() => result.current.moveColumnBy("id", -1));
        act(() => result.current.moveColumnBy("phone", 1));

        expect(orderedKeys(result)).toEqual(["id", "name", "email", "phone", "actions"]);
        expect(getStoredColumnOrder("t")).toEqual([]);

        act(() => result.current.moveColumnBy("name", 1));

        expect(orderedKeys(result)).toEqual(["id", "email", "name", "phone", "actions"]);
    });

    it("tornare all'ordine predefinito a mano toglie la scelta salvata", () => {
        const { result } = renderHook(() => useColumnOrder("t", columns));

        act(() => result.current.moveColumnBy("name", 1));
        act(() => result.current.moveColumnBy("name", -1));

        expect(result.current.isCustomOrder).toBe(false);
        expect(localStorage.length).toBe(0);
    });

    it("resetColumnOrder ripristina e cancella la scelta", () => {
        const { result } = renderHook(() => useColumnOrder("t", columns));

        act(() => result.current.moveColumn("phone", 0));
        act(() => result.current.resetColumnOrder());

        expect(orderedKeys(result)).toEqual(["id", "name", "email", "phone", "actions"]);
        expect(result.current.isCustomOrder).toBe(false);
        expect(getStoredColumnOrder("t")).toEqual([]);
    });

    it("tiene lo stesso array finché non cambia l'ordine", () => {
        const { result, rerender } = renderHook(() => useColumnOrder("t", columns));
        const first = result.current.orderedColumns;

        rerender();
        expect(result.current.orderedColumns).toBe(first);

        act(() => result.current.moveColumnBy("name", 1));
        expect(result.current.orderedColumns).not.toBe(first);
    });
});
