import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import TablePagination from "./table-pagination";

const setViewportWidth = (width: number) => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
};

afterEach(() => {
    setViewportWidth(1024);
});

const pageButtons = () =>
    screen.queryAllByRole("button", { name: /^Vai alla pagina \d+$/ }).map((button) => Number(button.textContent));

const renderPagination = (props: Partial<Parameters<typeof TablePagination>[0]> = {}) =>
    render(
        <TablePagination
            currentPage={1}
            totalPages={10}
            totalItems={100}
            pageSize={10}
            onPageChange={() => {}}
            {...props}
        />
    );

describe("TablePagination", () => {
    it("non disegna nulla quando non ci sono risultati", () => {
        const { container } = renderPagination({ totalItems: 0, totalPages: 0 });

        expect(container).toBeEmptyDOMElement();
    });

    it("annuncia l'intervallo mostrato, con l'ultima pagina parziale", () => {
        renderPagination({ currentPage: 3, totalPages: 3, totalItems: 25 });

        expect(screen.getByRole("status")).toHaveTextContent("Visualizzati 21-25 di 25");
    });

    it("con poche pagine le mostra tutte", () => {
        renderPagination({ totalPages: 4, totalItems: 40 });

        expect(pageButtons()).toEqual([1, 2, 3, 4]);
    });

    it("con molte pagine abbrevia intorno a quella corrente", () => {
        renderPagination({ currentPage: 1 });

        expect(pageButtons()).toEqual([1, 2, 3, 10]);
    });

    it.each([
        [5, [1, 4, 5, 6, 10]],
        [9, [1, 8, 9, 10]],
    ])("alla pagina %i mostra %j", (currentPage, expected) => {
        renderPagination({ currentPage });

        expect(pageButtons()).toEqual(expected);
    });

    it("segna la pagina corrente e disabilita le frecce ai due estremi", () => {
        renderPagination({ currentPage: 1 });

        expect(screen.getByRole("button", { name: "Vai alla pagina 1" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("button", { name: "Vai alla pagina precedente" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Vai alla pagina successiva" })).toBeEnabled();
    });

    it("cambia pagina con i numeri e con le frecce", async () => {
        const onPageChange = vi.fn();
        renderPagination({ currentPage: 5, onPageChange });

        await userEvent.click(screen.getByRole("button", { name: "Vai alla pagina 6" }));
        await userEvent.click(screen.getByRole("button", { name: "Vai alla pagina successiva" }));
        await userEvent.click(screen.getByRole("button", { name: "Vai alla pagina precedente" }));

        expect(onPageChange.mock.calls).toEqual([[6], [6], [4]]);
    });

    it("con una sola pagina mostra solo il conteggio", () => {
        renderPagination({ totalPages: 1, totalItems: 7 });

        expect(screen.getByRole("status")).toHaveTextContent("Visualizzati 1-7 di 7");
        expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    });

    it("su schermi stretti mostra pagina/totale al posto dei numeri", () => {
        setViewportWidth(400);
        renderPagination({ currentPage: 4 });

        expect(pageButtons()).toEqual([]);
        expect(screen.getByText("4/10")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent(/^31-40 di 100$/);
    });

    it("mostra il selettore delle righe solo se il chiamante lo gestisce", async () => {
        const onPageSizeChange = vi.fn();
        const { rerender } = renderPagination();
        expect(screen.queryByRole("combobox", { name: "Righe per pagina" })).not.toBeInTheDocument();

        rerender(
            <TablePagination
                currentPage={1}
                totalPages={10}
                totalItems={100}
                pageSize={10}
                onPageChange={() => {}}
                onPageSizeChange={onPageSizeChange}
            />
        );

        await userEvent.click(screen.getByRole("combobox", { name: "Righe per pagina" }));
        await userEvent.click(screen.getByRole("option", { name: "50" }));

        // Il valore arriva come numero, non come la stringa del select.
        expect(onPageSizeChange).toHaveBeenCalledWith(50);
    });
});
