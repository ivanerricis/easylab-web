import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EntityCardList from "./entity-card-list";
import EntityTable, { type EntityColumn } from "./entity-table";

type Row = { id: number; firstName: string; lastName: string | null; status: string; email: string };

const columns: EntityColumn<Row>[] = [
    { key: "id", header: "ID", render: (row) => row.id },
    { key: "firstName", header: "Nome", cardSlot: "title", render: (row) => row.firstName },
    { key: "lastName", header: "Cognome", cardSlot: "title", render: (row) => row.lastName ?? "-" },
    { key: "status", header: "Stato", cardSlot: "badge", render: (row) => row.status },
    { key: "email", header: "Email", cardSlot: "wide", render: (row) => row.email },
    { key: "actions", header: "Azioni", render: () => null },
];

const rows: Row[] = [
    { id: 1, firstName: "Mario", lastName: "Rossi", status: "Aperto", email: "mario@example.com" },
    { id: 2, firstName: "Anna", lastName: null, status: "Chiuso", email: "anna@example.com" },
];

beforeEach(() => {
    localStorage.clear();
});

/**
 * La tabella e le schede sono entrambe nel DOM e si alternano per CSS (`sm:table` /
 * `sm:hidden`), che jsdom non applica: per questo le query restano dentro l'una o l'altra.
 */
const renderTable = (props: Partial<Parameters<typeof EntityTable<Row>>[0]> = {}) =>
    render(
        <EntityTable<Row>
            tableKey="test"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyMessage="Nessun elemento."
            renderRowActions={(row) => <button>Modifica {row.id}</button>}
            {...props}
        />,
        // Il Router serve al ripristino dello scroll, che tiene le posizioni per voce di cronologia.
        { wrapper: MemoryRouter }
    );

describe("EntityTable: ordinamento dalle intestazioni", () => {
    const sortableColumns: EntityColumn<Row>[] = columns.map((column) =>
        column.key === "firstName"
            ? { ...column, sortKey: "name" }
            : column.key === "id"
              ? { ...column, sortKey: "createdAt", defaultSortDirection: "desc" }
              : column
    );

    it("rende cliccabili solo le colonne che il server sa ordinare, e segna quella in uso", () => {
        renderTable({
            columns: sortableColumns,
            sort: { key: "name", direction: "asc" },
            onSortChange: vi.fn(),
        });
        const table = screen.getByRole("table");

        expect(within(table).getByRole("button", { name: "Nome" })).toBeInTheDocument();
        expect(within(table).getByRole("button", { name: "ID" })).toBeInTheDocument();
        expect(within(table).queryByRole("button", { name: "Email" })).not.toBeInTheDocument();
        expect(within(table).getByRole("columnheader", { name: "Nome" })).toHaveAttribute("aria-sort", "ascending");
        expect(within(table).getByRole("columnheader", { name: "ID" })).not.toHaveAttribute("aria-sort");
    });

    it("il primo clic usa il verso della colonna, il secondo lo inverte", () => {
        const onSortChange = vi.fn();
        const { rerender } = renderTable({
            columns: sortableColumns,
            sort: { key: "name", direction: "asc" },
            onSortChange,
        });
        const table = screen.getByRole("table");

        fireEvent.click(within(table).getByRole("button", { name: "ID" }));
        expect(onSortChange).toHaveBeenLastCalledWith({ key: "createdAt", direction: "desc" });

        fireEvent.click(within(table).getByRole("button", { name: "Nome" }));
        expect(onSortChange).toHaveBeenLastCalledWith({ key: "name", direction: "desc" });

        rerender(
            <EntityTable<Row>
                tableKey="test"
                columns={sortableColumns}
                rows={rows}
                getRowKey={(row) => row.id}
                emptyMessage="Nessun elemento."
                renderRowActions={() => null}
                sort={{ key: "name", direction: "desc" }}
                onSortChange={onSortChange}
            />
        );
        expect(within(table).getByRole("columnheader", { name: "Nome" })).toHaveAttribute("aria-sort", "descending");
        fireEvent.click(within(table).getByRole("button", { name: "Nome" }));
        expect(onSortChange).toHaveBeenLastCalledWith({ key: "name", direction: "asc" });
    });

    it("senza onSortChange le intestazioni restano testo", () => {
        renderTable({ columns: sortableColumns, sort: { key: "name", direction: "asc" } });

        expect(within(screen.getByRole("table")).queryByRole("button", { name: "Nome" })).not.toBeInTheDocument();
    });
});

describe("EntityTable: colonne nascoste", () => {
    it("toglie le colonne dalla tabella ma non dalle schede", () => {
        renderTable({ hiddenColumnKeys: ["email", "id"] });
        const table = screen.getByRole("table");

        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((cell) => cell.textContent)
        ).toEqual(["Nome", "Cognome", "Stato", "Azioni"]);
        expect(within(table).queryByText("mario@example.com")).not.toBeInTheDocument();
        // Nelle schede (mobile) l'email c'è ancora: lì il menu non esiste.
        expect(screen.getByText("mario@example.com")).toBeInTheDocument();
    });
});

describe("EntityTable: riordino delle colonne", () => {
    const headerCell = (name: string) => within(screen.getByRole("table")).getByRole("columnheader", { name });
    const dataTransfer = () => ({ setData: vi.fn(), effectAllowed: "" });

    /**
     * jsdom non ha layout e i suoi eventi di drag non portano `clientX`: lo si aggiunge a mano.
     * Con il rettangolo della colonna a zero, un valore negativo cade nella metà sinistra e uno
     * positivo nella destra.
     */
    const fireDragEvent = (type: "dragOver" | "drop", name: string, side: "before" | "after") => {
        const event = createEvent[type](headerCell(name), { dataTransfer: dataTransfer() });

        Object.defineProperty(event, "clientX", { value: side === "before" ? -1 : 1 });
        fireEvent(headerCell(name), event);
    };

    const dragColumn = (from: string, to: string, side: "before" | "after") => {
        fireEvent.dragStart(headerCell(from), { dataTransfer: dataTransfer() });
        fireDragEvent("dragOver", to, side);
        fireDragEvent("drop", to, side);
    };

    it("senza onColumnMove le intestazioni non sono trascinabili", () => {
        renderTable();

        expect(headerCell("Nome")).not.toHaveAttribute("draggable");
    });

    it("rende trascinabili tutte le intestazioni tranne le azioni", () => {
        renderTable({ onColumnMove: vi.fn() });

        expect(headerCell("Nome")).toHaveAttribute("draggable", "true");
        expect(headerCell("Azioni")).not.toHaveAttribute("draggable");
    });

    it("rilasciando sulla metà sinistra mette la colonna prima di quella sotto il puntatore", () => {
        const onColumnMove = vi.fn();

        renderTable({ onColumnMove });
        dragColumn("Email", "Nome", "before");

        // id, firstName, lastName, status, email, actions: email (4) prima di firstName (1).
        expect(onColumnMove).toHaveBeenCalledWith("email", 1);
    });

    it("rilasciando sulla metà destra mette la colonna dopo, con l'indice corretto dopo lo spostamento", () => {
        const onColumnMove = vi.fn();

        renderTable({ onColumnMove });
        dragColumn("ID", "Cognome", "after");

        // id (0) dopo lastName (2): finisce all'indice 2, perché togliendola le altre scalano.
        expect(onColumnMove).toHaveBeenCalledWith("id", 2);
    });

    it("calcola l'indice sull'elenco completo, anche con colonne nascoste in mezzo", () => {
        const onColumnMove = vi.fn();

        renderTable({ onColumnMove, hiddenColumnKeys: ["lastName", "status"] });
        dragColumn("ID", "Email", "after");

        // Visibili: ID, Nome, Email, Azioni; ma nell'elenco completo email è alla posizione 4.
        expect(onColumnMove).toHaveBeenCalledWith("id", 4);
    });

    it("non chiama onColumnMove se la colonna resterebbe dov'è", () => {
        const onColumnMove = vi.fn();

        renderTable({ onColumnMove });
        dragColumn("Nome", "Nome", "after");
        dragColumn("Nome", "ID", "after");

        expect(onColumnMove).not.toHaveBeenCalled();
    });

    it("la colonna delle azioni non accetta rilasci", () => {
        const onColumnMove = vi.fn();

        renderTable({ onColumnMove });
        dragColumn("Email", "Azioni", "before");

        expect(onColumnMove).not.toHaveBeenCalled();
    });

    it("mostra dove cadrà la colonna e toglie l'indicatore a fine trascinamento", () => {
        renderTable({ onColumnMove: vi.fn() });

        fireEvent.dragStart(headerCell("Email"), { dataTransfer: dataTransfer() });
        fireDragEvent("dragOver", "Nome", "before");
        expect(headerCell("Nome")).toHaveAttribute("data-drop-side", "before");
        expect(headerCell("Email")).toHaveAttribute("data-dragging", "true");
        // La linea prosegue nel corpo, sulla colonna di destinazione.
        const nomeIndex = Array.from(headerCell("Nome").parentElement!.children).indexOf(headerCell("Nome"));
        const dropLineRule = () =>
            Array.from(document.querySelectorAll("style"))
                .map((style) => style.textContent ?? "")
                .find((css) => css.includes("data-column-drag-table"));
        expect(dropLineRule()).toContain(`tbody tr > :nth-child(${nomeIndex + 1})`);
        expect(dropLineRule()).toContain("inset 4px");

        fireEvent.dragEnd(headerCell("Email"));
        expect(dropLineRule()).toBeUndefined();
        expect(headerCell("Nome")).not.toHaveAttribute("data-drop-side");
        expect(headerCell("Email")).not.toHaveAttribute("data-dragging");
    });

    it("non avvia il trascinamento dalla maniglia di ridimensionamento", () => {
        const onColumnMove = vi.fn();

        renderTable({ onColumnMove });
        const handle = document.createElement("span");

        handle.setAttribute("data-column-resize-handle", "");
        headerCell("Nome").appendChild(handle);

        fireEvent.mouseDown(handle);
        const notCancelled = fireEvent.dragStart(headerCell("Nome"), { dataTransfer: dataTransfer() });

        expect(notCancelled).toBe(false);
        fireDragEvent("dragOver", "Cognome", "after");
        fireDragEvent("drop", "Cognome", "after");
        expect(onColumnMove).not.toHaveBeenCalled();
    });

    it("l'ordinamento per clic sull'intestazione continua a funzionare", () => {
        const onSortChange = vi.fn();

        renderTable({
            onColumnMove: vi.fn(),
            onSortChange,
            columns: columns.map((column) => (column.key === "firstName" ? { ...column, sortKey: "name" } : column)),
        });
        fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "Nome" }));

        expect(onSortChange).toHaveBeenCalledWith({ key: "name", direction: "asc" });
    });

    it("con l'ordine cambiato le colonne seguono quello ricevuto, anche nelle righe", () => {
        const { rerender } = renderTable();
        const reordered = [columns[1], columns[0], ...columns.slice(2)];

        rerender(
            <EntityTable<Row>
                tableKey="test"
                columns={reordered}
                rows={rows}
                getRowKey={(row) => row.id}
                emptyMessage="Nessun elemento."
            />
        );

        const table = screen.getByRole("table");

        expect(
            within(table)
                .getAllByRole("columnheader")
                .slice(0, 2)
                .map((cell) => cell.textContent)
        ).toEqual(["Nome", "ID"]);
        expect(within(table).getAllByRole("row")[1].querySelectorAll("td")[0]).toHaveTextContent("Mario");
    });
});

describe("EntityTable: colonne non nascondibili", () => {
    /**
     * Lo "Stato" dei report è diventato non nascondibile dopo che qualcuno l'aveva già nascosto:
     * la chiave salvata nelle preferenze non deve più toglierlo dalla tabella.
     */
    it("disegna una colonna con hideable: false anche se è fra le nascoste", () => {
        renderTable({
            columns: columns.map((column) => (column.key === "status" ? { ...column, hideable: false } : column)),
            hiddenColumnKeys: ["status", "email"],
        });
        const table = screen.getByRole("table");

        expect(within(table).getByRole("columnheader", { name: "Stato" })).toBeInTheDocument();
        expect(within(table).queryByRole("columnheader", { name: "Email" })).not.toBeInTheDocument();
    });
});

describe("EntityTable", () => {
    it("disegna intestazioni, valori e azioni di ogni riga", () => {
        renderTable();
        const table = screen.getByRole("table");

        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((cell) => cell.textContent)
        ).toEqual(["ID", "Nome", "Cognome", "Stato", "Email", "Azioni"]);
        expect(within(table).getAllByRole("row")).toHaveLength(3);
        expect(within(table).getByText("mario@example.com")).toBeInTheDocument();
        expect(within(table).getByRole("button", { name: "Modifica 2" })).toBeInTheDocument();
    });

    it("mostra il messaggio di lista vuota", () => {
        renderTable({ rows: [] });

        expect(within(screen.getByRole("table")).getByText("Nessun elemento.")).toBeInTheDocument();
    });

    /** Una lista che non si è potuta leggere non deve dire "Nessun elemento.". */
    it("senza righe e con un errore di caricamento mostra l'errore e 'Riprova', in tabella e nelle schede", () => {
        const onRetry = vi.fn();
        renderTable({ rows: [], loadError: "Impossibile caricare i report", onRetry });

        expect(screen.queryByText("Nessun elemento.")).not.toBeInTheDocument();

        const table = screen.getByRole("table");
        expect(within(table).getByText("Impossibile caricare i report.")).toBeInTheDocument();
        fireEvent.click(within(table).getByRole("button", { name: "Riprova" }));
        expect(onRetry).toHaveBeenCalledTimes(1);

        // Le schede su mobile: tutto ciò che non è la tabella.
        const buttons = screen.getAllByRole("button", { name: "Riprova" });
        expect(buttons).toHaveLength(2);
        fireEvent.click(buttons.find((button) => !table.contains(button))!);
        expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it("con delle righe già in tabella un errore di ricarica le lascia dove sono", () => {
        renderTable({ loadError: "Impossibile caricare i report", onRetry: vi.fn() });

        expect(within(screen.getByRole("table")).getByText("Mario")).toBeInTheDocument();
        expect(screen.queryByText("Impossibile caricare i report.")).not.toBeInTheDocument();
    });

    /**
     * Con "Tutte" le righe per pagina valgono 5000: una riga-scheletro per record bloccava il
     * browser per minuti prima ancora che arrivassero i dati.
     */
    it("limita le righe-scheletro del primo caricamento", () => {
        renderTable({ rows: [], isInitialLoading: true, skeletonRowCount: 5000 });
        const table = screen.getByRole("table");

        expect(table).toHaveAttribute("aria-busy", "true");
        // Una riga d'intestazione più le quindici di scheletro.
        expect(within(table).getAllByRole("row")).toHaveLength(16);
        expect(within(table).queryByText("Nessun elemento.")).not.toBeInTheDocument();
    });

    it("apre la riga con il doppio click, ma non dai pulsanti di riga", () => {
        const onRowOpen = vi.fn();
        renderTable({ onRowOpen });
        const table = screen.getByRole("table");

        fireEvent.doubleClick(within(table).getByText("Mario"));
        expect(onRowOpen).toHaveBeenCalledWith(rows[0]);

        onRowOpen.mockClear();
        fireEvent.doubleClick(within(table).getByRole("button", { name: "Modifica 1" }));
        expect(onRowOpen).not.toHaveBeenCalled();
    });

    /**
     * Q5: `HoverDetailCell` (usato per "Altro" nelle colonne di difetto/tipo) è un `<button>`
     * dentro una colonna qualunque, non nella cella delle azioni: prima solo la cella delle
     * azioni e `CustomerLink` fermavano il doppio click con `stopPropagation`, e un doppio
     * click su un bottone come questo apriva sia il suo popover sia la scheda della riga. La
     * correzione riconosce qualunque punto interattivo dal `target`, non da dove sta nella riga.
     */
    it("non apre la riga dal doppio click su un bottone dentro una colonna qualunque", () => {
        const onRowOpen = vi.fn();
        const columnsWithButton: EntityColumn<Row>[] = columns.map((column) =>
            column.key === "email"
                ? { ...column, render: (row) => <button type="button">Altro: {row.email}</button> }
                : column
        );
        renderTable({ columns: columnsWithButton, onRowOpen });
        const table = screen.getByRole("table");

        fireEvent.doubleClick(within(table).getByRole("button", { name: /Altro: mario/ }));

        expect(onRowOpen).not.toHaveBeenCalled();
    });

    it("colora le righe secondo lo stato", () => {
        renderTable({ getRowStatusColor: (row) => (row.status === "Aperto" ? "red" : "green") });
        const [, first, second] = within(screen.getByRole("table")).getAllByRole("row");

        expect(first).toHaveAttribute("data-status-color", "red");
        expect(second).toHaveAttribute("data-status-color", "green");
    });

    it("il colore di stato resta sulla cella ID anche se l'ID non è la prima colonna", () => {
        const idLast = [...columns.filter((column) => column.key !== "id" && column.key !== "actions"), columns[0]];
        const { unmount } = renderTable({ columns: idLast, getRowStatusColor: () => "red" });
        const [, firstRow] = within(screen.getByRole("table")).getAllByRole("row");
        const markedCells = firstRow.querySelectorAll("[data-status-cell]");

        expect(markedCells).toHaveLength(1);
        expect(markedCells[0]).toHaveTextContent(String(rows[0].id));
        unmount();

        // Senza la colonna ID il colore va sulla prima colonna, come prima.
        renderTable({ columns: idLast, hiddenColumnKeys: ["id"], getRowStatusColor: () => "red" });
        const [, rowWithoutId] = within(screen.getByRole("table")).getAllByRole("row");

        expect(rowWithoutId.querySelector("[data-status-cell]")).toBe(rowWithoutId.firstElementChild);
    });

    it("segnala la ricarica senza togliere le righe", () => {
        renderTable({ isRefetching: true });
        const table = screen.getByRole("table");

        expect(table).toHaveAttribute("aria-busy", "true");
        expect(within(table).getByText("Mario")).toBeInTheDocument();
    });
});

describe("EntityCardList", () => {
    const renderCards = (props: Partial<Parameters<typeof EntityCardList<Row>>[0]> = {}) =>
        render(
            <EntityCardList<Row>
                columns={columns.filter((column) => column.key !== "actions")}
                rows={rows}
                getRowKey={(row) => row.id}
                emptyMessage="Nessun elemento."
                renderActions={(row) => <button>Apri {row.id}</button>}
                {...props}
            />
        );

    it("compone il titolo con le colonne 'title' e mette l'ID sopra", () => {
        renderCards();
        const [mario, anna] = screen.getAllByRole("article");

        // `h2`: sotto l'`h1` della pagina, senza saltare un livello.
        expect(within(mario).getByRole("heading", { level: 2 })).toHaveTextContent("Mario Rossi");
        expect(within(mario).getByText("#1")).toBeInTheDocument();
        // Il segnaposto "-" di un cognome assente non finisce nel titolo.
        expect(within(anna).getByRole("heading")).toHaveTextContent(/^Anna$/);
    });

    it("mostra lo stato nel badge, con l'intestazione per gli screen reader", () => {
        renderCards();
        const [mario] = screen.getAllByRole("article");

        expect(within(mario).getByText("Stato:")).toHaveClass("sr-only");
        expect(within(mario).getByText("Aperto")).toBeInTheDocument();
    });

    it("elenca le altre colonne come dettagli, con le azioni in fondo", () => {
        renderCards();
        const [mario] = screen.getAllByRole("article");

        expect(within(mario).getByText("Email")).toBeInTheDocument();
        expect(within(mario).getByText("mario@example.com")).toBeInTheDocument();
        expect(within(mario).getByRole("button", { name: "Apri 1" })).toBeInTheDocument();
    });

    it("nasconde i dettagli secondari finché la scheda non si apre", () => {
        renderCards({
            columns: [
                ...columns.filter((column) => column.key !== "actions"),
                { key: "note", header: "Note", cardCollapsed: true, render: () => "da richiamare" },
            ],
        });
        const [mario] = screen.getAllByRole("article");
        const toggle = within(mario).getByRole("button", { name: "Altri dettagli (1)" });

        expect(within(mario).queryByText("da richiamare")).not.toBeInTheDocument();
        expect(within(mario).getByText("mario@example.com")).toBeInTheDocument();
        expect(toggle).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(toggle);

        expect(within(mario).getByText("da richiamare")).toBeInTheDocument();
        expect(toggle).toHaveAttribute("aria-expanded", "true");
    });

    it("toglie una riga dalla sola scheda in cui 'cardHiddenWhen' è vero", () => {
        renderCards({
            columns: [
                ...columns.filter((column) => column.key !== "actions"),
                {
                    key: "warning",
                    header: "Avviso",
                    cardHiddenWhen: (row) => row.id !== 1,
                    render: (row) => `avviso ${row.id}`,
                },
            ],
        });
        const [mario, anna] = screen.getAllByRole("article");

        expect(within(mario).getByText("Avviso")).toBeInTheDocument();
        expect(within(mario).getByText("avviso 1")).toBeInTheDocument();
        expect(within(anna).queryByText("Avviso")).not.toBeInTheDocument();
    });

    it("senza dettagli secondari non mostra il comando per aprire la scheda", () => {
        renderCards();

        expect(screen.queryByRole("button", { name: /dettagli/ })).not.toBeInTheDocument();
    });

    it("senza colonne titolo intitola la scheda con l'ID", () => {
        renderCards({ columns: columns.filter((column) => column.key === "id" || column.key === "email") });

        expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["#1", "#2"]);
    });

    it("mostra il vuoto e lo scheletro", () => {
        const { rerender } = renderCards({ rows: [] });
        expect(screen.getByText("Nessun elemento.")).toBeInTheDocument();

        rerender(
            <EntityCardList<Row>
                columns={columns}
                rows={[]}
                getRowKey={(row) => row.id}
                emptyMessage="Nessun elemento."
                isInitialLoading
                skeletonCardCount={2}
            />
        );
        expect(screen.queryByText("Nessun elemento.")).not.toBeInTheDocument();
        expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });
});

describe("EntityTable: righe a blocchi", () => {
    const manyRows: Row[] = Array.from({ length: 250 }, (_, index) => ({
        id: index + 1,
        firstName: `Nome${index + 1}`,
        lastName: "Rossi",
        status: "Aperto",
        email: `n${index + 1}@example.com`,
    }));

    type FakeObserver = { callback: IntersectionObserverCallback; disconnected: boolean };
    let observers: FakeObserver[] = [];

    beforeEach(() => {
        sessionStorage.clear();
        observers = [];
        vi.stubGlobal(
            "IntersectionObserver",
            class {
                entry: FakeObserver;
                constructor(callback: IntersectionObserverCallback) {
                    this.entry = { callback, disconnected: false };
                    observers.push(this.entry);
                }
                observe() {}
                disconnect() {
                    this.entry.disconnected = true;
                }
            }
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const liveObservers = () => observers.filter((observer) => !observer.disconnected);

    /** Fa arrivare la sentinella vicino allo schermo, come lo scroll. */
    const reachBottom = () =>
        act(() => {
            liveObservers()
                .at(-1)
                ?.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        });

    const tableRowCount = () => within(screen.getByRole("table")).getAllByRole("row").length - 1;

    it("disegna solo il primo blocco e aggiunge il successivo quando si arriva in fondo", () => {
        renderTable({ rows: manyRows });

        expect(tableRowCount()).toBe(100);

        reachBottom();
        expect(tableRowCount()).toBe(200);

        reachBottom();
        expect(tableRowCount()).toBe(250);
        // Finite le righe la sentinella sparisce e nessun osservatore resta attivo.
        expect(liveObservers()).toHaveLength(0);
        // Centinaia di righe in jsdom: a suite intera, con i worker in parallelo, i 5s non bastano.
    }, 30_000);

    it("non osserva niente se la lista sta nel primo blocco", () => {
        renderTable({ rows: manyRows.slice(0, 100) });

        expect(tableRowCount()).toBe(100);
        expect(liveObservers()).toHaveLength(0);
    });

    it("riparte dal primo blocco quando la lista cambia", () => {
        const view = renderTable({ rows: manyRows });
        reachBottom();
        expect(tableRowCount()).toBe(200);

        view.rerender(
            <EntityTable<Row>
                tableKey="test"
                columns={columns}
                rows={[...manyRows].reverse()}
                getRowKey={(row) => row.id}
                emptyMessage="Nessun elemento."
                renderRowActions={(row) => <button>Modifica {row.id}</button>}
            />
        );

        expect(tableRowCount()).toBe(100);
    });

    it("ritrova le righe già disegnate tornando alla stessa voce di cronologia", () => {
        const first = renderTable({ rows: manyRows });
        reachBottom();
        expect(tableRowCount()).toBe(200);
        first.unmount();

        renderTable({ rows: manyRows });

        expect(tableRowCount()).toBe(200);
    }, 30_000);
});
