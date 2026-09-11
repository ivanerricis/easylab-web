import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { createCollaborator, deleteCollaborator, listCollaborators, updateCollaborator } from "./collaborators";
import {
    createCustomer,
    deleteCustomer,
    getCustomer,
    getCustomerInterventionsPrintUrl,
    getCustomerReportsPrintUrl,
    listCustomers,
    updateCustomer,
} from "./customers";
import { createDevice, deleteDevice, listDevices, updateDevice } from "./devices";
import { createIssue, deleteIssue, listIssues, updateIssue } from "./issues";
import { createTechnician, deleteTechnician, getTechnician, listTechnicians, updateTechnician } from "./technicians";

/**
 * Le cinque anagrafiche hanno lo stesso contratto con il backend: righe con `created_at` /
 * `updated_at` da rinominare, e `list*` che senza parametri restituisce l'array nudo e con
 * i parametri la pagina. Un solo elenco di casi le prova tutte allo stesso modo, così una
 * che se ne discosta salta all'occhio.
 */
const entities = [
    {
        name: "customers",
        list: listCustomers,
        create: createCustomer,
        update: updateCustomer,
        remove: deleteCustomer,
        payload: { firstName: "Mario" },
    },
    {
        name: "collaborators",
        list: listCollaborators,
        create: createCollaborator,
        update: updateCollaborator,
        remove: deleteCollaborator,
        payload: { firstName: "Luca" },
    },
    {
        name: "devices",
        list: listDevices,
        create: createDevice,
        update: updateDevice,
        remove: deleteDevice,
        payload: { name: "Notebook" },
    },
    {
        name: "issues",
        list: listIssues,
        create: createIssue,
        update: updateIssue,
        remove: deleteIssue,
        payload: { description: "Schermo rotto" },
    },
    {
        name: "technicians",
        list: listTechnicians,
        create: createTechnician,
        update: updateTechnician,
        remove: deleteTechnician,
        payload: { firstName: "Paolo" },
    },
] as const;

const rawRow = { id: 7, label: "riga", created_at: "2026-01-01T00:00:00.000Z", updated_at: null };
const mappedRow = { id: 7, label: "riga", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null };

const mockResponse = (method: "get" | "post" | "put" | "delete", data: unknown) =>
    vi.spyOn(api, method).mockResolvedValue({ data });

beforeEach(() => {
    vi.restoreAllMocks();
});

describe.each(entities)("api $name", ({ name, list, create, update, remove, payload }) => {
    it("senza parametri restituisce l'elenco completo con i timestamp rinominati", async () => {
        const get = mockResponse("get", [rawRow]);

        await expect((list as () => Promise<unknown>)()).resolves.toEqual([mappedRow]);
        expect(get).toHaveBeenCalledWith(`/${name}`);
    });

    it("con i parametri chiede la pagina e rinomina i timestamp delle righe", async () => {
        const get = mockResponse("get", { items: [rawRow], totalItems: 1, page: 2, pageSize: 20, totalPages: 1 });
        const signal = new AbortController().signal;

        const result = await (list as (params: object) => Promise<unknown>)({
            page: 2,
            pageSize: 20,
            search: "  mario  ",
            signal,
        });

        expect(result).toEqual({ items: [mappedRow], totalItems: 1, page: 2, pageSize: 20, totalPages: 1 });
        expect(get).toHaveBeenCalledWith(`/${name}`, {
            params: expect.objectContaining({ page: 2, pageSize: 20, search: "mario" }),
            signal,
        });
    });

    /** Una ricerca di soli spazi non deve filtrare: il parametro sparisce dalla query. */
    it("omette la ricerca vuota e applica i valori predefiniti di pagina", async () => {
        const get = mockResponse("get", { items: [], totalItems: 0, page: 1, pageSize: 1000, totalPages: 0 });

        await (list as (params: object) => Promise<unknown>)({ search: "   " });

        expect(get).toHaveBeenCalledWith(`/${name}`, {
            params: expect.objectContaining({ page: 1, pageSize: 1000, search: undefined }),
            signal: undefined,
        });
    });

    it("crea, modifica ed elimina sulla rotta dell'entità", async () => {
        const post = mockResponse("post", rawRow);
        const put = mockResponse("put", rawRow);
        const del = mockResponse("delete", rawRow);

        await expect((create as (p: object) => Promise<unknown>)(payload)).resolves.toEqual(mappedRow);
        await expect((update as (id: number, p: object) => Promise<unknown>)(7, payload)).resolves.toEqual(mappedRow);
        await expect(remove(7)).resolves.toEqual(mappedRow);

        expect(post).toHaveBeenCalledWith(`/${name}`, payload);
        expect(put).toHaveBeenCalledWith(`/${name}/7`, payload);
        expect(del).toHaveBeenCalledWith(`/${name}/7`);
    });
});

describe("api clienti e tecnici per id", () => {
    it("legge la singola scheda", async () => {
        const get = mockResponse("get", rawRow);

        await expect(getCustomer(7)).resolves.toEqual(mappedRow);
        await expect(getTechnician(7)).resolves.toEqual(mappedRow);

        expect(get).toHaveBeenNthCalledWith(1, "/customers/7");
        expect(get).toHaveBeenNthCalledWith(2, "/technicians/7");
    });

    it("passa ordinamento e verso all'elenco clienti", async () => {
        const get = mockResponse("get", { items: [], totalItems: 0, page: 1, pageSize: 10, totalPages: 0 });

        await listCustomers({ sortBy: "name", sortOrder: "asc" });

        expect(get).toHaveBeenCalledWith("/customers", {
            params: expect.objectContaining({ sortBy: "name", sortOrder: "asc" }),
            signal: undefined,
        });
    });

    it("costruisce gli URL di stampa con l'intervallo di date, se indicato", () => {
        const reportsUrl = getCustomerReportsPrintUrl(3, { dateFrom: "2026-01-01", dateTo: "2026-01-31" });

        expect(reportsUrl).toContain("/customers/3/reports/print");
        expect(reportsUrl).toContain("dateFrom=2026-01-01");
        expect(reportsUrl).toContain("dateTo=2026-01-31");

        const interventionsUrl = getCustomerInterventionsPrintUrl(3);
        expect(interventionsUrl).toContain("/customers/3/interventions/print");
        expect(interventionsUrl).not.toContain("dateFrom");
    });
});
