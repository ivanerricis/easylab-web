import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../index";
import { reportTechnicianTable } from "../schema";
import { assignTechnician, insertReport, insertTechnician } from "../../test/db/fixtures";
import { createReport, deleteReportById, getReportDetailById, updateReportById } from "./report";

const technicianRowsOf = (reportId: number) =>
    db.select().from(reportTechnicianTable).where(eq(reportTechnicianTable.reportId, reportId));

/**
 * Il tecnico esterno si scrive con il report, nella stessa transazione. Prima era una risorsa a
 * parte, e le pagine riconciliavano a mano aggiunta, aggiornamento, sostituzione e rimozione.
 */
describe("createReport / updateReportById: il tecnico esterno", () => {
    it("crea il report e la riga del suo tecnico", async () => {
        const base = await insertReport();
        const technician = await insertTechnician();

        const [created] = await createReport(
            { customerId: base.customerId, deviceId: base.deviceId, issueId: base.issueId },
            { technicianId: technician.id, price: 40 }
        );

        expect(await technicianRowsOf(created.id)).toEqual([
            {
                reportId: created.id,
                technicianId: technician.id,
                price: 40,
                created_at: expect.any(Date),
                updated_at: null,
            },
        ]);
    });

    it("sostituisce il tecnico e il compenso sulla stessa riga", async () => {
        const report = await insertReport();
        const [first, second] = [await insertTechnician(), await insertTechnician()];
        await assignTechnician(report.id, first.id, 10);

        await updateReportById(report.id, {}, { technicianId: second.id, price: 25 });

        expect(await technicianRowsOf(report.id)).toEqual([
            {
                reportId: report.id,
                technicianId: second.id,
                price: 25,
                created_at: expect.any(Date),
                updated_at: expect.any(Date),
            },
        ]);
    });

    it("con technicianId null toglie il tecnico", async () => {
        const report = await insertReport();
        await assignTechnician(report.id, (await insertTechnician()).id, 10);

        await updateReportById(report.id, { note: "Senza tecnico" }, { technicianId: null, price: 0 });

        expect(await technicianRowsOf(report.id)).toEqual([]);
    });

    it("senza il tecnico nella richiesta lascia la riga com'è", async () => {
        const report = await insertReport();
        const technician = await insertTechnician();
        await assignTechnician(report.id, technician.id, 10);

        await updateReportById(report.id, { note: "Solo la nota" });

        expect(await technicianRowsOf(report.id)).toHaveLength(1);
    });

    it("un tecnico inesistente annulla anche la modifica al report", async () => {
        const report = await insertReport({ note: "Prima" });

        await expect(
            updateReportById(report.id, { note: "Dopo" }, { technicianId: 999_999, price: 5 })
        ).rejects.toThrow();

        const [detail] = await getReportDetailById(report.id);
        expect(detail.note).toBe("Prima");
    });
});

describe("deleteReportById", () => {
    // Il difetto trovato nella revisione del 2026-09-18: la chiave esterna era "no action", e
    // un report con un tecnico non si poteva eliminare. Migration 0032.
    it("elimina anche un report che ha un tecnico esterno, e la riga del tecnico con lui", async () => {
        const report = await insertReport();
        await assignTechnician(report.id, (await insertTechnician()).id, 10);

        await expect(deleteReportById(report.id)).resolves.toHaveLength(1);
        expect(await technicianRowsOf(report.id)).toEqual([]);
    });
});

describe("updated_at", () => {
    it("resta vuoto alla creazione e si riempie alla prima modifica", async () => {
        const report = await insertReport();
        expect(report.updated_at).toBeNull();

        const [updated] = await updateReportById(report.id, { note: "Modificato" });

        expect(updated.updated_at).toBeInstanceOf(Date);
    });
});
