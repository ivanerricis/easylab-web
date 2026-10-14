import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    listCustomers: vi.fn(),
    listReports: vi.fn(),
    listInterventions: vi.fn(),
    getReport: vi.fn(),
    getIntervention: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return { ...errors, ...api };
});

const toastError = vi.fn();

vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

import GlobalSearch from "./global-search";
import { parseGlobalQuery } from "@/lib/globalSearchQuery";
import { currentLocation } from "@/test/currentLocation";
import { LocationProbe } from "@/test/locationProbe";
import { renderWithProviders } from "@/test/render";

const page = <T,>(items: T[]) => ({ items, totalItems: items.length, page: 1, pageSize: 5, totalPages: 1 });

const timestamps = { createdAt: "2026-09-01T10:00:00.000Z", updatedAt: null };

const customer = {
    id: 3,
    firstName: "Mario",
    lastName: "Rossi",
    phoneNumber: "333 1234567",
    phoneNumberSecondary: null,
    email: null,
    city: null,
    ...timestamps,
};

const report = {
    id: 12,
    customer: "Mario Rossi",
    device: "Notebook",
    issue: "Schermo rotto",
    closed: false,
};

const intervention = {
    id: 9,
    customer: "Mario Rossi",
    type: "customer_site",
    status: "scheduled",
    interventionDate: "2026-09-20",
};

const reportDetail = { ...report, customerName: "Mario Rossi", deviceName: "Notebook", issueName: "Schermo rotto" };
const interventionDetail = { ...intervention, customerName: "Mario Rossi" };

const notFound = () => new AxiosError("Not found", "ERR_BAD_REQUEST", undefined, undefined, { status: 404 } as never);

const renderSearch = () =>
    renderWithProviders(
        <>
            <GlobalSearch />
            <LocationProbe />
        </>,
        { route: "/dashboard" }
    );

const dialog = () => screen.getByRole("dialog", { name: "Ricerca" });
const input = () => within(dialog()).getByRole("combobox");

beforeEach(() => {
    vi.clearAllMocks();
    api.listCustomers.mockResolvedValue(page([customer]));
    api.listReports.mockResolvedValue(page([report]));
    api.listInterventions.mockResolvedValue(page([intervention]));
    api.getReport.mockResolvedValue(reportDetail);
    api.getIntervention.mockResolvedValue(interventionDetail);
});

describe("GlobalSearch", () => {
    it("si apre dal pulsante e con Ctrl+K, e mostra le pagine prima di scrivere", async () => {
        renderSearch();

        await userEvent.keyboard("{Control>}k{/Control}");
        expect(dialog()).toBeInTheDocument();
        expect(within(dialog()).getByRole("option", { name: /Tecnici esterni/ })).toBeInTheDocument();
        // Senza testo non si chiede niente al server.
        expect(api.listReports).not.toHaveBeenCalled();

        await userEvent.keyboard("{Escape}");
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));
        expect(dialog()).toBeInTheDocument();
    });

    it("cerca in clienti, report e interventi insieme, e apre il risultato scelto", async () => {
        renderSearch();
        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));

        await userEvent.type(input(), "rossi");

        const reportOption = await within(dialog()).findByRole("option", { name: /#12.*Mario Rossi/ });
        expect(within(dialog()).getByRole("option", { name: /Mario Rossi.*333 1234567/ })).toBeInTheDocument();
        expect(within(dialog()).getByRole("option", { name: /#9.*Mario Rossi.*Programmato/ })).toBeInTheDocument();
        // Nessun report escluso: la ricerca guarda anche quelli chiusi.
        expect(api.listReports).toHaveBeenCalledWith(
            expect.objectContaining({ search: "rossi", visibility: "all", pageSize: 5 })
        );
        expect(api.listInterventions).toHaveBeenCalledWith(expect.objectContaining({ search: "rossi", status: "all" }));

        await userEvent.click(reportOption);

        expect(currentLocation().pathname).toBe("/reports/12");
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });

    it("un numero senza cancelletto cerca ovunque, clienti compresi, e porta alla lista", async () => {
        renderSearch();
        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));

        await userEvent.type(input(), "12");

        await within(dialog()).findByRole("option", { name: /#12/ });
        expect(api.listCustomers).toHaveBeenCalledWith(expect.objectContaining({ search: "12" }));
        expect(api.listReports).toHaveBeenCalledWith(expect.objectContaining({ search: "12" }));
        expect(api.getReport).not.toHaveBeenCalled();

        await userEvent.click(within(dialog()).getByRole("option", { name: "Vedi tutti i report trovati" }));

        expect(currentLocation()).toEqual({ pathname: "/reports", params: { visibility: "all", q: "12" } });
    });

    describe("con il cancelletto", () => {
        const openAndType = async (text: string) => {
            renderSearch();
            await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));
            await userEvent.type(input(), text);
        };

        it("#123 cerca il record con quel numero e basta, senza clienti, liste, 'Vedi tutti' né pagine", async () => {
            await openAndType("#123");

            await within(dialog()).findByRole("option", { name: /#12.*Mario Rossi.*Notebook/ });
            expect(api.getReport).toHaveBeenCalledWith(123, expect.any(AbortSignal));
            expect(api.getIntervention).toHaveBeenCalledWith(123, expect.any(AbortSignal));
            expect(within(dialog()).getByRole("option", { name: /#9.*Mario Rossi.*Programmato/ })).toBeInTheDocument();
            expect(api.listCustomers).not.toHaveBeenCalled();
            expect(api.listReports).not.toHaveBeenCalled();
            expect(api.listInterventions).not.toHaveBeenCalled();
            expect(within(dialog()).queryByRole("option", { name: /Vedi tutti/ })).not.toBeInTheDocument();
            expect(within(dialog()).queryByRole("option", { name: /Dashboard/ })).not.toBeInTheDocument();
            expect(within(dialog()).queryByText("Clienti")).not.toBeInTheDocument();

            await userEvent.click(within(dialog()).getByRole("option", { name: /#9/ }));

            expect(currentLocation().pathname).toBe("/interventions/9");
        });

        it("un 404 lascia vuoto quel gruppo senza errori, e gli altri restano", async () => {
            api.getReport.mockRejectedValue(notFound());
            await openAndType("#123");

            await within(dialog()).findByRole("option", { name: /#9/ });
            expect(within(dialog()).queryByText("Report")).not.toBeInTheDocument();
            expect(within(dialog()).getByText("Interventi")).toBeInTheDocument();
            expect(toastError).not.toHaveBeenCalled();
        });

        it("un errore diverso da 404 nasconde solo quel gruppo", async () => {
            api.getIntervention.mockRejectedValue(new Error("Timeout"));
            await openAndType("#123");

            await within(dialog()).findByRole("option", { name: /#12/ });
            expect(within(dialog()).getByText("Report")).toBeInTheDocument();
            expect(within(dialog()).queryByText("Interventi")).not.toBeInTheDocument();
            expect(toastError).not.toHaveBeenCalled();
        });

        it("se nessun record ha quel numero dice che non c'è niente", async () => {
            api.getReport.mockRejectedValue(notFound());
            api.getIntervention.mockRejectedValue(notFound());
            await openAndType("#123");

            expect(await within(dialog()).findByText('Nessun risultato per "#123".')).toBeInTheDocument();
            expect(toastError).not.toHaveBeenCalled();
        });

        it("un numero che non può essere un id non chiede niente al server", async () => {
            await openAndType("#99999999999");

            expect(await within(dialog()).findByText('Nessun risultato per "#99999999999".')).toBeInTheDocument();
            expect(api.getReport).not.toHaveBeenCalled();
            expect(api.getIntervention).not.toHaveBeenCalled();
        });

        it("#server cerca il testo solo in report e interventi, con 'Vedi tutti'", async () => {
            await openAndType("#server");

            await within(dialog()).findByRole("option", { name: /#12/ });
            expect(api.listReports).toHaveBeenCalledWith(expect.objectContaining({ search: "server" }));
            expect(api.listInterventions).toHaveBeenCalledWith(expect.objectContaining({ search: "server" }));
            expect(api.listCustomers).not.toHaveBeenCalled();
            expect(api.getReport).not.toHaveBeenCalled();

            await userEvent.click(within(dialog()).getByRole("option", { name: "Vedi tutti i report trovati" }));

            expect(currentLocation()).toEqual({ pathname: "/reports", params: { visibility: "all", q: "server" } });
        });

        it("il solo # non cerca e non mostra le pagine", async () => {
            await openAndType("#");

            await new Promise((resolve) => setTimeout(resolve, 350));
            expect(api.getReport).not.toHaveBeenCalled();
            expect(api.listReports).not.toHaveBeenCalled();
            expect(within(dialog()).queryByRole("option", { name: /Dashboard/ })).not.toBeInTheDocument();
        });
    });

    it("suggerisce il # prima di scrivere", async () => {
        renderSearch();
        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));

        expect(within(dialog()).getByText(/Digita # e un numero/)).toBeInTheDocument();
    });

    it("con una lettera sola non cerca, e filtra solo le pagine", async () => {
        renderSearch();
        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));

        await userEvent.type(input(), "d");

        expect(within(dialog()).getByRole("option", { name: /Dashboard/ })).toBeInTheDocument();
        expect(within(dialog()).getByRole("option", { name: /Dispositivi/ })).toBeInTheDocument();
        expect(within(dialog()).queryByRole("option", { name: /Clienti/ })).not.toBeInTheDocument();
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect(api.listCustomers).not.toHaveBeenCalled();
    });

    it("dice quando non trova niente", async () => {
        api.listCustomers.mockResolvedValue(page([]));
        api.listReports.mockResolvedValue(page([]));
        api.listInterventions.mockResolvedValue(page([]));
        renderSearch();
        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));

        await userEvent.type(input(), "zzzz");

        expect(await within(dialog()).findByText('Nessun risultato per "zzzz".')).toBeInTheDocument();
    });

    /** Un gruppo che fallisce non svuota gli altri; l'avviso arriva solo se non risponde nessuno. */
    it("mostra quello che arriva se un gruppo fallisce, e avvisa solo se falliscono tutti", async () => {
        api.listCustomers.mockRejectedValue(new Error("Timeout"));
        renderSearch();
        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));

        await userEvent.type(input(), "rossi");

        expect(await within(dialog()).findByRole("option", { name: /#12/ })).toBeInTheDocument();
        expect(toastError).not.toHaveBeenCalled();

        api.listReports.mockRejectedValue(new Error("Timeout"));
        api.listInterventions.mockRejectedValue(new Error("Timeout"));
        await userEvent.type(input(), "x");

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Timeout");
        });
    });
});

describe("parseGlobalQuery", () => {
    it("senza # cerca ovunque, anche con un numero", () => {
        expect(parseGlobalQuery(" rossi ")).toEqual({ scope: "all", text: "rossi", exact: false, exactId: null });
        expect(parseGlobalQuery("123")).toEqual({ scope: "all", text: "123", exact: false, exactId: null });
    });

    it("# e solo cifre è il numero esatto, spazi compresi", () => {
        expect(parseGlobalQuery("#123")).toEqual({ scope: "numbered", text: "123", exact: true, exactId: 123 });
        expect(parseGlobalQuery("# 12")).toEqual({ scope: "numbered", text: "12", exact: true, exactId: 12 });
    });

    it("# e altro testo cerca il testo senza il #", () => {
        expect(parseGlobalQuery("#server")).toEqual({ scope: "numbered", text: "server", exact: false, exactId: null });
        expect(parseGlobalQuery("##5")).toEqual({ scope: "numbered", text: "#5", exact: false, exactId: null });
    });

    it("il solo # non ha testo", () => {
        expect(parseGlobalQuery("#")).toEqual({ scope: "numbered", text: "", exact: false, exactId: null });
    });

    it("#0 e un numero oltre i 32 bit sono esatti ma senza id possibile", () => {
        expect(parseGlobalQuery("#0")).toEqual({ scope: "numbered", text: "0", exact: true, exactId: null });
        expect(parseGlobalQuery("#2147483647").exactId).toBe(2147483647);
        expect(parseGlobalQuery("#2147483648")).toMatchObject({ exact: true, exactId: null });
        expect(parseGlobalQuery("#99999999999999999999")).toMatchObject({ exact: true, exactId: null });
    });
});
