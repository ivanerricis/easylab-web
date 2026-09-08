import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Il modulo delle query è mockato: questo test copre routing, validazione e forma
// delle risposte senza bisogno di un Postgres attivo.
vi.mock("../db/queries/device", () => ({
    listDevices: vi.fn(),
    getDeviceById: vi.fn(),
    createDevice: vi.fn(),
    updateDeviceById: vi.fn(),
    deleteDeviceById: vi.fn(),
}));

import { createDevice, deleteDeviceById, getDeviceById, listDevices, updateDeviceById } from "../db/queries/device";
import devicesRouter from "./devices";
import { maxPageSize } from "../db/queries/pagination";
import { errorHandler } from "../middleware/errorHandler";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/devices", devicesRouter);
    app.use(errorHandler);
    return app;
};

const device = { id: 1, name: "Stampante", created_at: new Date(), updated_at: null };

describe("devices router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("restituisce la lista non paginata quando mancano page/pageSize", async () => {
        vi.mocked(listDevices).mockResolvedValue([device] as never);

        const response = await request(buildApp()).get("/api/devices");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
    });

    it("calcola totalPages quando la lista è paginata", async () => {
        vi.mocked(listDevices).mockResolvedValue({ items: [device], totalItems: 25 } as never);

        const response = await request(buildApp()).get("/api/devices?page=2&pageSize=10");

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ totalItems: 25, page: 2, pageSize: 10, totalPages: 3 });
    });

    it("restituisce almeno una pagina anche senza risultati", async () => {
        vi.mocked(listDevices).mockResolvedValue({ items: [], totalItems: 0 } as never);

        const response = await request(buildApp()).get("/api/devices?page=1&pageSize=10");

        expect(response.body.totalPages).toBe(1);
    });

    // L'opzione "Tutte" del selettore righe per pagina manda esattamente `maxPageSize`:
    // se il tetto venisse riabbassato, quell'opzione smetterebbe di funzionare con un 400
    // e nient'altro in questa suite se ne accorgerebbe.
    it("accetta un pageSize pari al tetto e rifiuta quello successivo", async () => {
        vi.mocked(listDevices).mockResolvedValue({ items: [device], totalItems: 1 } as never);

        const accepted = await request(buildApp()).get(`/api/devices?page=1&pageSize=${maxPageSize}`);
        const rejected = await request(buildApp()).get(`/api/devices?page=1&pageSize=${maxPageSize + 1}`);

        expect(accepted.status).toBe(200);
        expect(accepted.body).toMatchObject({ pageSize: maxPageSize, totalPages: 1 });
        expect(rejected.status).toBe(400);
    });

    it("risponde 404 quando il dispositivo non esiste", async () => {
        vi.mocked(getDeviceById).mockResolvedValue([] as never);

        const response = await request(buildApp()).get("/api/devices/999");

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Device not found");
    });

    it("crea un dispositivo e risponde 201", async () => {
        vi.mocked(createDevice).mockResolvedValue([device] as never);

        const response = await request(buildApp()).post("/api/devices").send({ name: "Stampante" });

        expect(response.status).toBe(201);
        expect(createDevice).toHaveBeenCalledWith({ name: "Stampante" });
    });

    it("rifiuta la creazione con nome vuoto", async () => {
        const response = await request(buildApp()).post("/api/devices").send({ name: "   " });

        expect(response.status).toBe(400);
        expect(createDevice).not.toHaveBeenCalled();
    });

    it("rifiuta un update senza campi", async () => {
        const response = await request(buildApp()).put("/api/devices/1").send({});

        expect(response.status).toBe(400);
        expect(updateDeviceById).not.toHaveBeenCalled();
    });

    it("risponde 404 sull'update di un id inesistente", async () => {
        vi.mocked(updateDeviceById).mockResolvedValue([] as never);

        const response = await request(buildApp()).put("/api/devices/999").send({ name: "Nuovo" });

        expect(response.status).toBe(404);
    });

    it("elimina un dispositivo esistente", async () => {
        vi.mocked(deleteDeviceById).mockResolvedValue([device] as never);

        const response = await request(buildApp()).delete("/api/devices/1");

        expect(response.status).toBe(200);
        expect(deleteDeviceById).toHaveBeenCalledWith(1);
    });

    it("propaga la violazione di FK all'errorHandler come 400", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(deleteDeviceById).mockRejectedValue(
            Object.assign(new Error('update or delete on table "device" violates foreign key constraint'), {
                code: "23503",
                constraint: "report_device_id_device_id_fk",
            })
        );

        const response = await request(buildApp()).delete("/api/devices/1");

        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Impossibile eliminare il dispositivo");
    });
});
