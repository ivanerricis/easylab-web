import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import {
    createReport,
    deleteReport,
    getReport,
    getReportPrintUrl,
    getReportStats,
    listReports,
    updateReport,
} from "./reports";
import { createReportTechnician, deleteReportTechnician, updateReportTechnician } from "./reportTechnicians";

/** Postgres restituisce i `numeric` come stringhe: il client li deve convertire. */
const rawReport = {
    id: 1,
    customer: "Mario Rossi",
    price: "120.50",
    internalPrice: "20",
    technicianPrice: 0,
    totalPrice: "140.50",
};

beforeEach(() => {
    vi.restoreAllMocks();
});

describe("api report", () => {
    it("converte in numero i prezzi dell'elenco completo", async () => {
        vi.spyOn(api, "get").mockResolvedValue({ data: [rawReport] });

        const [report] = await listReports();

        expect(report.price).toBe(120.5);
        expect(report.internalPrice).toBe(20);
        expect(report.technicianPrice).toBe(0);
        expect(report.totalPrice).toBe(140.5);
    });

    it("converte i prezzi anche nella pagina e passa tutti i filtri", async () => {
        const get = vi.spyOn(api, "get").mockResolvedValue({
            data: { items: [rawReport], totalItems: 1, page: 1, pageSize: 10, totalPages: 1 },
        });

        const result = await listReports({
            page: 1,
            pageSize: 10,
            search: " rossi ",
            visibility: "open",
            dateFrom: "2026-01-01",
            dateTo: "2026-01-31",
            collaboratorId: 4,
            customerId: 5,
            technicianId: 6,
            sortBy: "totalPrice",
            sortOrder: "desc",
        });

        expect(result.items[0].totalPrice).toBe(140.5);
        expect(get).toHaveBeenCalledWith("/reports", {
            params: {
                page: 1,
                pageSize: 10,
                search: "rossi",
                visibility: "open",
                dateFrom: "2026-01-01",
                dateTo: "2026-01-31",
                collaboratorId: 4,
                customerId: 5,
                technicianId: 6,
                sortBy: "totalPrice",
                sortOrder: "desc",
            },
            signal: undefined,
        });
    });

    it("usa le rotte del singolo report", async () => {
        const get = vi.spyOn(api, "get").mockResolvedValue({ data: { id: 1 } });
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: { id: 1 } });
        const put = vi.spyOn(api, "put").mockResolvedValue({ data: { id: 1 } });
        const del = vi.spyOn(api, "delete").mockResolvedValue({ data: { id: 1 } });

        await getReport(1);
        await createReport({ customerId: 1, deviceId: 2, issueId: 3 });
        await updateReport(1, { closed: true });
        await deleteReport(1);

        expect(get).toHaveBeenCalledWith("/reports/1");
        expect(post).toHaveBeenCalledWith("/reports", { customerId: 1, deviceId: 2, issueId: 3 });
        expect(put).toHaveBeenCalledWith("/reports/1", { closed: true });
        expect(del).toHaveBeenCalledWith("/reports/1");
        expect(getReportPrintUrl(1)).toContain("/reports/1/print");
    });

    it("chiede le statistiche del mese indicato", async () => {
        const get = vi.spyOn(api, "get").mockResolvedValue({ data: { openCount: 3 } });

        await expect(getReportStats("2026-09")).resolves.toEqual({ openCount: 3 });
        expect(get).toHaveBeenCalledWith("/reports/stats", { params: { month: "2026-09" } });
    });
});

describe("api tecnici del report", () => {
    it("indirizza la coppia report/tecnico nella rotta", async () => {
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
        const put = vi.spyOn(api, "put").mockResolvedValue({ data: {} });
        const del = vi.spyOn(api, "delete").mockResolvedValue({ data: {} });

        await createReportTechnician({ reportId: 1, technicianId: 2, price: 30 });
        await updateReportTechnician(1, 2, 45);
        await deleteReportTechnician(1, 2);

        expect(post).toHaveBeenCalledWith("/report-technicians", { reportId: 1, technicianId: 2, price: 30 });
        expect(put).toHaveBeenCalledWith("/report-technicians/1/2", { price: 45 });
        expect(del).toHaveBeenCalledWith("/report-technicians/1/2");
    });
});
