import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-mobile";
import { useDocumentTitle } from "./useDocumentTitle";
import { useTableRowsPerPage } from "./useTableRowsPerPage";

const setViewportWidth = (width: number) => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
};

afterEach(() => {
    setViewportWidth(1024);
});

describe("useIsMobile", () => {
    it("confronta la larghezza della finestra con il breakpoint", () => {
        setViewportWidth(500);
        expect(renderHook(() => useIsMobile()).result.current).toBe(true);

        setViewportWidth(1024);
        expect(renderHook(() => useIsMobile()).result.current).toBe(false);
        expect(renderHook(() => useIsMobile(1200)).result.current).toBe(true);
    });

    it("si aggiorna quando la media query cambia", () => {
        let notify: () => void = () => {};
        vi.spyOn(window, "matchMedia").mockImplementation(
            (query: string) =>
                ({
                    media: query,
                    matches: false,
                    addEventListener: (_: string, listener: () => void) => {
                        notify = listener;
                    },
                    removeEventListener: vi.fn(),
                }) as unknown as MediaQueryList
        );
        setViewportWidth(1024);

        const { result } = renderHook(() => useIsMobile());
        expect(result.current).toBe(false);

        act(() => {
            setViewportWidth(600);
            notify();
        });

        expect(result.current).toBe(true);
    });
});

describe("useDocumentTitle", () => {
    beforeEach(() => {
        document.title = "Titolo precedente";
    });

    it("mette il nome dell'app in coda al titolo della pagina", () => {
        renderHook(() => useDocumentTitle("Clienti"));

        expect(document.title).toBe("Clienti · EasyLab");
    });

    it("usa il solo nome dell'app finché il titolo non è noto", () => {
        renderHook(() => useDocumentTitle(undefined));

        expect(document.title).toBe("EasyLab");
    });

    it("ripristina il titolo precedente allo smontaggio", () => {
        const { unmount } = renderHook(() => useDocumentTitle("Report"));

        unmount();

        expect(document.title).toBe("Titolo precedente");
    });
});

describe("useTableRowsPerPage", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("parte da 10 righe se non c'è niente di salvato", () => {
        const { result } = renderHook(() => useTableRowsPerPage("devices"));

        expect(result.current[0]).toBe(10);
    });

    it("ricade sulla vecchia impostazione globale", () => {
        localStorage.setItem("easylab-web-table-rows-per-page", "50");

        const { result } = renderHook(() => useTableRowsPerPage("devices"));

        expect(result.current[0]).toBe(50);
    });

    /**
     * Prima il valore era globale e letto una volta sola: cambiarlo non aveva effetto finché
     * non si cambiava pagina. Qui il cambio vale subito e resta per quella tabella soltanto.
     */
    it("applica subito il cambio e lo ricorda solo per quella tabella", () => {
        const { result } = renderHook(() => useTableRowsPerPage("interventions"));

        act(() => {
            result.current[1](20);
        });

        expect(result.current[0]).toBe(20);
        expect(renderHook(() => useTableRowsPerPage("interventions")).result.current[0]).toBe(20);
        expect(renderHook(() => useTableRowsPerPage("devices")).result.current[0]).toBe(10);
    });

    it("ignora un valore salvato non previsto", () => {
        localStorage.setItem("easylab-web-table-rows-per-page:devices", "7");

        expect(renderHook(() => useTableRowsPerPage("devices")).result.current[0]).toBe(10);
    });
});
