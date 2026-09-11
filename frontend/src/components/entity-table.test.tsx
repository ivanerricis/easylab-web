import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
        />
    );

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

    it("colora le righe secondo lo stato", () => {
        renderTable({ getRowStatusColor: (row) => (row.status === "Aperto" ? "red" : "green") });
        const [, first, second] = within(screen.getByRole("table")).getAllByRole("row");

        expect(first).toHaveAttribute("data-status-color", "red");
        expect(second).toHaveAttribute("data-status-color", "green");
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

    it("compone il titolo con le colonne 'title' e mette l'ID sotto", () => {
        renderCards();
        const [mario, anna] = screen.getAllByRole("article");

        expect(within(mario).getByRole("heading")).toHaveTextContent("Mario Rossi");
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
