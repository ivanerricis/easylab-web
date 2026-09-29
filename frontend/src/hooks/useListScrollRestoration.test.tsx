import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useListScrollRestoration } from "./useListScrollRestoration";

const storageKey = "list-scroll-positions";

/**
 * `requestAnimationFrame` in coda, svuotata dal test: il salvataggio avviene in un frame, e
 * così si decide esattamente quando. Una versione che chiamasse subito la funzione non va:
 * l'hook assegna il numero del frame *dopo* la chiamata, e resterebbe bloccato per sempre.
 */
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

const flushFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
};

beforeEach(() => {
    sessionStorage.clear();
    frames = new Map();
    nextFrame = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
        const id = nextFrame++;
        frames.set(id, callback);
        return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
        frames.delete(id);
    });
});

/**
 * Una lista come quella di `EntityTable`: il contenitore della tabella dentro il riquadro
 * della pagina dentro il `<main>`, tutti e tre che scorrono. Le righe arrivano con "Carica",
 * così si può provare anche il momento prima che siano in pagina.
 */
const List = ({ initiallyReady }: { initiallyReady: boolean }) => {
    const anchorRef = useRef<HTMLTableElement>(null);
    const [isReady, setIsReady] = useState(initiallyReady);
    useListScrollRestoration({ anchorRef, tableKey: "reports", isReady });

    return (
        <main data-testid="main" style={{ overflowY: "auto" }}>
            <div data-testid="page" style={{ overflowY: "auto" }}>
                <div data-testid="table" data-slot="table-container" style={{ overflowY: "auto" }}>
                    <table ref={anchorRef} />
                </div>
            </div>
            <button onClick={() => setIsReady(true)}>Carica</button>
        </main>
    );
};

const Nav = () => {
    const navigate = useNavigate();

    return (
        <nav>
            <button onClick={() => navigate("/reports/5")}>Apri dettaglio</button>
            <button onClick={() => navigate(-1)}>Indietro</button>
            <button onClick={() => navigate("/reports?q=rossi")}>Link alla lista</button>
        </nav>
    );
};

const renderApp = ({ initiallyReady = true, route = "/reports?q=rossi" } = {}) =>
    render(
        <MemoryRouter initialEntries={[route]}>
            <Nav />
            <Routes>
                <Route path="/reports" element={<List initiallyReady={initiallyReady} />} />
                <Route path="/reports/:id" element={<p>Dettaglio</p>} />
            </Routes>
        </MemoryRouter>
    );

const containers = () => [screen.getByTestId("table"), screen.getByTestId("page"), screen.getByTestId("main")];

const scrollTops = () => containers().map((container) => container.scrollTop);

/** Scorre i tre contenitori come farebbe l'utente e lascia passare il frame del salvataggio. */
const scrollTo = (offsets: number[]) => {
    containers().forEach((container, index) => {
        container.scrollTop = offsets[index];
        fireEvent.scroll(container);
    });
    act(() => flushFrames());
};

const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

const storedPositions = () => JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as Record<string, number[]>;

describe("useListScrollRestoration", () => {
    it('con "Indietro" dal dettaglio rimette tutti i contenitori dov\'erano', () => {
        renderApp();
        scrollTo([120, 340, 50]);

        click("Apri dettaglio");
        expect(screen.getByText("Dettaglio")).toBeInTheDocument();
        click("Indietro");

        expect(scrollTops()).toEqual([120, 340, 50]);
    });

    it("salva una volta per frame, con la posizione dell'ultimo scroll", () => {
        renderApp();
        const table = screen.getByTestId("table");

        table.scrollTop = 10;
        fireEvent.scroll(table);
        table.scrollTop = 20;
        fireEvent.scroll(table);

        expect(frames.size).toBe(1);
        expect(sessionStorage.getItem(storageKey)).toBeNull();

        act(() => flushFrames());

        expect(Object.values(storedPositions())).toEqual([[20, 0, 0]]);
    });

    /** Un link nuovo alla stessa lista ha un'altra voce di cronologia: parte dall'inizio. */
    it("un link nuovo alla stessa lista parte dall'inizio", () => {
        renderApp();
        scrollTo([120, 340, 50]);

        click("Apri dettaglio");
        click("Link alla lista");

        expect(scrollTops()).toEqual([0, 0, 0]);
    });

    /**
     * La prima voce della cronologia ha sempre la chiave "default": senza l'indirizzo nella
     * chiave, una lista aperta da zero con un'altra ricerca ritroverebbe la posizione di questa.
     */
    it("una lista aperta da zero con un'altra ricerca non prende la posizione di un'altra", () => {
        const first = renderApp();
        scrollTo([120, 340, 50]);
        first.unmount();

        renderApp({ route: "/reports?q=bianchi" });

        expect(scrollTops()).toEqual([0, 0, 0]);
        expect(Object.keys(storedPositions())).toEqual(["default:/reports?q=rossi:reports"]);
    });

    /**
     * Prima che le righe siano in pagina non c'è un'altezza a cui tornare, e uno scroll di
     * quel momento (il contenitore che si accorcia sotto lo scheletro) non deve cancellare la
     * posizione salvata.
     */
    it("aspetta le righe per ripristinare, e fino ad allora non sovrascrive la posizione salvata", () => {
        renderApp({ initiallyReady: false });
        click("Carica");
        scrollTo([120, 340, 50]);
        const saved = storedPositions();

        click("Apri dettaglio");
        click("Indietro");

        expect(scrollTops()).toEqual([0, 0, 0]);
        scrollTo([0, 0, 0]);
        expect(frames.size).toBe(0);
        expect(storedPositions()).toEqual(saved);

        click("Carica");

        expect(scrollTops()).toEqual([120, 340, 50]);
    });

    it("tiene al massimo 50 posizioni, buttando le più vecchie", () => {
        const old = Object.fromEntries(Array.from({ length: 55 }, (_, index) => [`vecchia-${index}`, [index]]));
        sessionStorage.setItem(storageKey, JSON.stringify(old));

        renderApp();
        scrollTo([7, 0, 0]);

        const keys = Object.keys(storedPositions());
        expect(keys).toHaveLength(50);
        expect(keys[0]).toBe("vecchia-6");
        expect(keys.at(-1)).toMatch(/:reports$/);
        expect(storedPositions()[keys.at(-1)!]).toEqual([7, 0, 0]);
    });

    it("una posizione già salvata torna in fondo quando si aggiorna, e non viene buttata per prima", () => {
        renderApp();
        scrollTo([1, 0, 0]);
        const [ownKey] = Object.keys(storedPositions());
        const others = Object.fromEntries(Array.from({ length: 49 }, (_, index) => [`altra-${index}`, [index]]));
        sessionStorage.setItem(storageKey, JSON.stringify({ [ownKey]: [1, 0, 0], ...others }));

        scrollTo([2, 0, 0]);

        const keys = Object.keys(storedPositions());
        expect(keys).toHaveLength(50);
        expect(keys.at(-1)).toBe(ownKey);
        expect(keys[0]).toBe("altra-0");
    });

    it("con un sessionStorage illeggibile non si rompe e parte dall'inizio", () => {
        sessionStorage.setItem(storageKey, "{non è json");

        renderApp();

        expect(scrollTops()).toEqual([0, 0, 0]);
        expect(() => scrollTo([5, 0, 0])).not.toThrow();
    });

    it("con il sessionStorage bloccato non si rompe", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("Quota superata", "QuotaExceededError");
        });

        renderApp();

        expect(() => scrollTo([5, 0, 0])).not.toThrow();
    });

    it("smontata la lista, annulla il frame in sospeso e smette di ascoltare", () => {
        const { unmount } = renderApp();
        const table = screen.getByTestId("table");
        table.scrollTop = 30;
        fireEvent.scroll(table);
        expect(frames.size).toBe(1);

        unmount();

        expect(frames.size).toBe(0);
        expect(sessionStorage.getItem(storageKey)).toBeNull();
    });

    it("smontata la lista, uno scroll dei contenitori staccati non salva più niente", () => {
        const { unmount } = renderApp();
        const table = screen.getByTestId("table");
        scrollTo([30, 0, 0]);
        const saved = sessionStorage.getItem(storageKey);

        unmount();
        table.scrollTop = 0;
        fireEvent.scroll(table);

        expect(frames.size).toBe(0);
        expect(sessionStorage.getItem(storageKey)).toBe(saved);
    });
});
