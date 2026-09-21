import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../../middleware/errorHandler";
import { insertCollaborator, insertCustomer, insertDevice, insertIntervention, insertIssue, insertReport } from "../../test/db/fixtures";
import { deleteCollaboratorById } from "./collaborator";
import { deleteCustomerById } from "./customer";
import { deleteDeviceById } from "./device";
import { deleteIssueById } from "./issue";

/**
 * Cosa succede a eliminare un cliente, un collaboratore, un dispositivo o un guasto ancora
 * referenziato da un report o da un intervento. Nessuna delle chiavi esterne coinvolte è in
 * cascata (vedi `drizzle/0000_mushy_morph.sql`, `0011_add_intervention.sql`,
 * `0012_intervention_collaborator.sql`: tutte `ON DELETE no action`), quindi Postgres deve
 * rifiutare la cancellazione con una violazione di chiave esterna (23503).
 *
 * Il tecnico esterno su un report è già coperto da `reportWrite.db.test.ts` (la cascata della
 * migration 0032): qui restano gli altri quattro riferimenti, quelli senza cascata.
 *
 * Ogni test spinge l'errore vero di Postgres dentro `errorHandler` (lo stesso middleware che
 * traduce ogni eccezione della API in risposta HTTP), invece di limitarsi al `rejects`: un mock
 * del database — come `errorHandler.test.ts` — non può accorgersi se il nome del vincolo
 * generato da una migration diverge da quello scritto a mano nella mappa `FK_MESSAGES`. Se
 * divergesse, qui il messaggio tornerebbe quello generico ("Riferimento non valido") invece di
 * quello specifico, e il test lo direbbe.
 */
const createResponse = () => {
    const res = {
        locals: {} as Record<string, unknown>,
        statusCode: 0,
        body: undefined as unknown,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
    };

    return res as unknown as Response & { statusCode: number; body: { message: string } };
};

/** Cattura l'errore vero sollevato da `remove`, e ne fa passare la risposta HTTP che ne uscirebbe. */
const deleteAndTranslate = async (remove: () => Promise<unknown>) => {
    const error = await remove().then(
        () => {
            throw new Error("la cancellazione doveva fallire per il vincolo di chiave esterna");
        },
        (caught: unknown) => caught
    );

    const res = createResponse();
    errorHandler(error, {} as Request, res, (() => {}) as NextFunction);
    return res;
};

describe("eliminare un'anagrafica ancora referenziata da un report", () => {
    it("il cliente: 400 con il messaggio sul report, non il dettaglio Postgres", async () => {
        const report = await insertReport();

        const res = await deleteAndTranslate(() => deleteCustomerById(report.customerId));

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Impossibile eliminare il cliente: è ancora associato a uno o più report.");
    });

    it("il dispositivo: 400 con il messaggio sul report", async () => {
        const report = await insertReport();

        const res = await deleteAndTranslate(() => deleteDeviceById(report.deviceId));

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe(
            "Impossibile eliminare il dispositivo: è ancora associato a uno o più report."
        );
    });

    it("il guasto: 400 con il messaggio sul report", async () => {
        const report = await insertReport();

        const res = await deleteAndTranslate(() => deleteIssueById(report.issueId));

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Impossibile eliminare il guasto: è ancora associato a uno o più report.");
    });

    it("il collaboratore quando è quello del report: 400 con il messaggio sul report", async () => {
        const collaborator = await insertCollaborator();
        await insertReport({ collaboratorId: collaborator.id });

        const res = await deleteAndTranslate(() => deleteCollaboratorById(collaborator.id));

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe(
            "Impossibile eliminare il collaboratore: è ancora associato a uno o più report."
        );
    });
});

describe("eliminare un'anagrafica ancora referenziata da un intervento", () => {
    it("il cliente: 400 con il messaggio sull'intervento", async () => {
        const intervention = await insertIntervention();

        const res = await deleteAndTranslate(() => deleteCustomerById(intervention.customerId));

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe(
            "Impossibile eliminare il cliente: è ancora associato a uno o più interventi."
        );
    });

    it("il collaboratore: 400 con il messaggio sull'intervento", async () => {
        const intervention = await insertIntervention();

        const res = await deleteAndTranslate(() => deleteCollaboratorById(intervention.collaboratorId));

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe(
            "Impossibile eliminare il collaboratore: è ancora associato a uno o più interventi."
        );
    });
});

describe("eliminare un'anagrafica non referenziata", () => {
    it("un cliente, un dispositivo e un guasto senza report né interventi si eliminano normalmente", async () => {
        const customer = await insertCustomer();
        const device = await insertDevice();
        const issue = await insertIssue();

        await expect(deleteCustomerById(customer.id)).resolves.toHaveLength(1);
        await expect(deleteDeviceById(device.id)).resolves.toHaveLength(1);
        await expect(deleteIssueById(issue.id)).resolves.toHaveLength(1);
    });
});
