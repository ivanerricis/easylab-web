import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import {
    createIntervention,
    deleteIntervention,
    getIntervention,
    getInterventionPrintUrl,
    getInterventionStats,
    listInterventions,
    sendInterventionEmail,
    updateIntervention,
} from "./interventions";

beforeEach(() => {
    vi.restoreAllMocks();
});

describe("api interventi", () => {
    it("senza parametri restituisce l'elenco così com'è", async () => {
        const get = vi.spyOn(api, "get").mockResolvedValue({ data: [{ id: 1 }] });

        await expect(listInterventions()).resolves.toEqual([{ id: 1 }]);
        expect(get).toHaveBeenCalledWith("/interventions");
    });

    it("passa filtri, intervalli e ordinamento alla pagina", async () => {
        const page = { items: [{ id: 1 }], totalItems: 1, page: 1, pageSize: 100, totalPages: 1 };
        const get = vi.spyOn(api, "get").mockResolvedValue({ data: page });
        const signal = new AbortController().signal;

        const result = await listInterventions({
            page: 1,
            pageSize: 100,
            search: "   ",
            status: "programmato",
            type: "intervento_sede",
            scheduledDate: "2026-09-11",
            scheduledFrom: "2026-09-01",
            scheduledTo: "2026-09-30",
            collaboratorId: 2,
            customerId: 3,
            sortBy: "interventionDate",
            sortOrder: "asc",
            signal,
        });

        expect(result).toEqual(page);
        expect(get).toHaveBeenCalledWith("/interventions", {
            params: {
                page: 1,
                pageSize: 100,
                search: undefined,
                status: "programmato",
                type: "intervento_sede",
                dateFrom: undefined,
                dateTo: undefined,
                scheduledDate: "2026-09-11",
                scheduledFrom: "2026-09-01",
                scheduledTo: "2026-09-30",
                collaboratorId: 2,
                customerId: 3,
                sortBy: "interventionDate",
                sortOrder: "asc",
            },
            signal,
        });
    });

    it("usa le rotte del singolo intervento", async () => {
        const get = vi.spyOn(api, "get").mockResolvedValue({ data: {} });
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: { message: "Inviata" } });
        const put = vi.spyOn(api, "put").mockResolvedValue({ data: {} });
        const del = vi.spyOn(api, "delete").mockResolvedValue({ data: {} });

        await getIntervention(9);
        await createIntervention({ type: "consegna_materiale", customerId: 1, collaboratorId: 2 });
        await updateIntervention(9, { status: "completato" });
        await deleteIntervention(9);
        await expect(sendInterventionEmail(9)).resolves.toEqual({ message: "Inviata" });
        await getInterventionStats();

        expect(get).toHaveBeenCalledWith("/interventions/9");
        expect(get).toHaveBeenCalledWith("/interventions/stats");
        expect(post).toHaveBeenCalledWith("/interventions", {
            type: "consegna_materiale",
            customerId: 1,
            collaboratorId: 2,
        });
        expect(post).toHaveBeenCalledWith("/interventions/9/send-email");
        expect(put).toHaveBeenCalledWith("/interventions/9", { status: "completato" });
        expect(del).toHaveBeenCalledWith("/interventions/9");
        expect(getInterventionPrintUrl(9)).toContain("/interventions/9/print");
    });
});
