import { afterEach, describe, expect, it, vi } from "vitest";
import { getListScrollContainers, scrollListToTop } from "./listScroll";

/**
 * Una pagina come quella dell'app, costruita a mano: fuori dal `<main>` un contenitore che
 * scorre (non va toccato), poi il `<main>`, il riquadro della pagina, un elemento che non
 * scorre e il contenitore della tabella. jsdom non impagina ma legge gli stili in linea, e
 * `getComputedStyle` è tutto quello che la funzione guarda.
 */
const buildPage = () => {
    document.body.innerHTML = `
        <div id="outside" style="overflow-y: auto">
            <main id="main" style="overflow-y: auto">
                <div id="page" style="overflow-y: scroll">
                    <div id="plain" style="overflow-y: hidden">
                        <div id="list">
                            <div id="table" data-slot="table-container" style="overflow-y: auto">
                                <table id="anchor"></table>
                            </div>
                            <div id="table2" data-slot="table-container" style="overflow-y: auto"></div>
                        </div>
                    </div>
                </div>
            </main>
        </div>`;

    const byId = (id: string) => document.getElementById(id) as HTMLElement;

    return {
        outside: byId("outside"),
        main: byId("main"),
        page: byId("page"),
        plain: byId("plain"),
        list: byId("list"),
        table: byId("table"),
        table2: byId("table2"),
    };
};

afterEach(() => {
    document.body.innerHTML = "";
});

describe("getListScrollContainers", () => {
    it("parte dall'elemento dato e sale solo per i contenitori che scorrono, fermandosi al <main>", () => {
        const { table, page, main } = buildPage();

        // `plain` (overflow hidden) e `list` (nessun overflow) restano fuori; `outside` sta
        // sopra il <main> e non va raggiunto.
        expect(getListScrollContainers(table)).toEqual([table, page, main]);
    });

    it("l'elemento di partenza c'è sempre, anche se non scorre", () => {
        const { list, page, main } = buildPage();

        expect(getListScrollContainers(list)).toEqual([list, page, main]);
    });

    it("senza <main> sale fino in cima", () => {
        document.body.innerHTML = `<div id="a" style="overflow-y: auto"><div id="b"></div></div>`;
        const a = document.getElementById("a");
        const b = document.getElementById("b");

        expect(getListScrollContainers(b)).toEqual([b, a]);
    });

    it("senza elemento di partenza non trova niente", () => {
        expect(getListScrollContainers(null)).toEqual([]);
    });
});

describe("scrollListToTop", () => {
    const setTop = (element: Element, top: number) =>
        vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ top } as DOMRect);

    it("riporta a zero il riquadro e tutte le tabelle che contiene, senza toccare gli altri contenitori", () => {
        const { list, table, table2, page, main } = buildPage();
        list.scrollTop = 300;
        table.scrollTop = 200;
        table2.scrollTop = 100;
        page.scrollTop = 50;
        main.scrollTop = 40;

        scrollListToTop(list);

        expect([list.scrollTop, table.scrollTop, table2.scrollTop]).toEqual([0, 0, 0]);
        expect([page.scrollTop, main.scrollTop]).toEqual([50, 40]);
    });

    /** Nel dettaglio di un cliente: si porta in vista l'inizio della lista, non la cima della scheda. */
    it("porta in vista l'inizio della lista solo se è sopra il bordo del contenitore esterno", () => {
        const { list, main } = buildPage();
        const scrollIntoView = vi.spyOn(list, "scrollIntoView");
        setTop(main, 100);

        setTop(list, 150);
        scrollListToTop(list);
        expect(scrollIntoView).not.toHaveBeenCalled();

        setTop(list, 100);
        scrollListToTop(list);
        expect(scrollIntoView).not.toHaveBeenCalled();

        setTop(list, 20);
        scrollListToTop(list);
        expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start" });
    });

    it("confronta con il contenitore più esterno (il <main>), non con il più vicino", () => {
        const { list, plain, main } = buildPage();
        const scrollIntoView = vi.spyOn(list, "scrollIntoView");
        // Sopra il bordo di `plain` ma non sopra quello del <main>: niente da fare.
        setTop(plain, 200);
        setTop(main, 0);
        setTop(list, 100);

        scrollListToTop(list);

        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it("una lista staccata dalla pagina si limita a tornare a zero", () => {
        const list = document.createElement("div");
        list.scrollTop = 80;
        const scrollIntoView = vi.spyOn(list, "scrollIntoView");

        scrollListToTop(list);

        expect(list.scrollTop).toBe(0);
        expect(scrollIntoView).not.toHaveBeenCalled();
    });
});
