import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Il modulo delle query è mockato: questo test copre routing, validazione e forma delle risposte.
// Vincoli e query vere stanno in `db/queries/customerDevice.db.test.ts`.
vi.mock("../db/queries/customerDevice", () => ({
    listCustomerDevices: vi.fn(),
    getCustomerDeviceById: vi.fn(),
    createCustomerDevice: vi.fn(),
    updateCustomerDeviceById: vi.fn(),
    deleteCustomerDeviceById: vi.fn(),
}));

import {
    createCustomerDevice,
    deleteCustomerDeviceById,
    getCustomerDeviceById,
    listCustomerDevices,
    updateCustomerDeviceById,
} from "../db/queries/customerDevice";
import customerDevicesRouter from "./customerDevices";
import { errorHandler } from "../middleware/errorHandler";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/customer-devices", customerDevicesRouter);
    app.use(errorHandler);
    return app;
};

const device = {
    id: 5,
    type: "server",
    name: "NAS ufficio",
    serialNumber: "SN-1",
    model: null,
    note: null,
    customerId: 3,
    created_at: new Date(),
    updated_at: null,
};

const body = { type: "server", name: " NAS ufficio ", serialNumber: " SN-1 ", customerId: 3 };

describe("customer devices router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("la lista inoltra il filtro per cliente e per tipo", async () => {
        vi.mocked(listCustomerDevices).mockResolvedValue([device] as never);

        const response = await request(buildApp()).get("/api/customer-devices?customerId=3&type=server&search=nas");

        expect(response.status).toBe(200);
        expect(listCustomerDevices).toHaveBeenCalledWith(
            expect.objectContaining({ customerId: 3, type: "server", search: "nas" })
        );
    });

    it("la lista paginata calcola totalPages", async () => {
        vi.mocked(listCustomerDevices).mockResolvedValue({ items: [device], totalItems: 25 } as never);

        const response = await request(buildApp()).get("/api/customer-devices?page=2&pageSize=10");

        expect(response.body).toMatchObject({ totalItems: 25, page: 2, pageSize: 10, totalPages: 3 });
    });

    it.each([
        ["un cliente non valido", "customerId=0"],
        ["un tipo sconosciuto", "type=stampante"],
    ])("la lista rifiuta %s", async (_label, query) => {
        expect((await request(buildApp()).get(`/api/customer-devices?${query}`)).status).toBe(400);
    });

    it("crea un dispositivo ripulendo gli spazi, con i facoltativi a null", async () => {
        vi.mocked(createCustomerDevice).mockResolvedValue([device] as never);

        const response = await request(buildApp())
            .post("/api/customer-devices")
            .send({ ...body, model: "", note: "" });

        expect(response.status).toBe(201);
        expect(createCustomerDevice).toHaveBeenCalledWith({
            type: "server",
            name: "NAS ufficio",
            serialNumber: "SN-1",
            model: null,
            note: null,
            customerId: 3,
        });
    });

    it.each([
        ["senza nome", { name: " " }],
        ["senza numero di serie", { serialNumber: "" }],
        ["con un tipo sconosciuto", { type: "stampante" }],
        ["senza cliente", { customerId: undefined }],
        ["con un campo sconosciuto", { colore: "rosso" }],
    ])("rifiuta la creazione %s", async (_label, override) => {
        const response = await request(buildApp())
            .post("/api/customer-devices")
            .send({ ...body, ...override });

        expect(response.status).toBe(400);
        expect(createCustomerDevice).not.toHaveBeenCalled();
    });

    it.each(["pc_desktop", "server", "copier", "firewall", "cash_register"])("accetta il tipo %s", async (type) => {
        vi.mocked(createCustomerDevice).mockResolvedValue([device] as never);

        expect(
            (
                await request(buildApp())
                    .post("/api/customer-devices")
                    .send({ ...body, type })
            ).status
        ).toBe(201);
    });

    it("un numero di serie già usato dal cliente risponde 409 col messaggio italiano", async () => {
        vi.mocked(createCustomerDevice).mockRejectedValue(
            Object.assign(new Error("dup"), {
                code: "23505",
                constraint: "customer_device_customer_serial_lower_idx",
            })
        );

        const response = await request(buildApp()).post("/api/customer-devices").send(body);

        expect(response.status).toBe(409);
        expect(response.body.message).toBe("Questo cliente ha già un dispositivo con questo numero di serie.");
    });

    it("la modifica non accetta il cambio di cliente e vuole almeno un campo", async () => {
        expect((await request(buildApp()).put("/api/customer-devices/5").send({ customerId: 4 })).status).toBe(400);
        expect((await request(buildApp()).put("/api/customer-devices/5").send({})).status).toBe(400);
        expect(updateCustomerDeviceById).not.toHaveBeenCalled();
    });

    it("la modifica scrive solo i campi indicati; una stringa vuota svuota i facoltativi", async () => {
        vi.mocked(updateCustomerDeviceById).mockResolvedValue([device] as never);

        await request(buildApp()).put("/api/customer-devices/5").send({ name: "Nuovo" });
        await request(buildApp()).put("/api/customer-devices/5").send({ model: "", note: null });

        expect(updateCustomerDeviceById).toHaveBeenNthCalledWith(1, 5, { name: "Nuovo" });
        expect(updateCustomerDeviceById).toHaveBeenNthCalledWith(2, 5, { model: null, note: null });
    });

    it("dettaglio e modifica rispondono 404 su un dispositivo mancante", async () => {
        vi.mocked(getCustomerDeviceById).mockResolvedValue([]);
        vi.mocked(updateCustomerDeviceById).mockResolvedValue([]);

        expect((await request(buildApp()).get("/api/customer-devices/9")).status).toBe(404);
        expect((await request(buildApp()).put("/api/customer-devices/9").send({ name: "x" })).status).toBe(404);
    });

    it("eliminando un dispositivo collegato a un contratto risponde 400 con il messaggio italiano", async () => {
        vi.mocked(deleteCustomerDeviceById).mockRejectedValue(
            Object.assign(new Error("update or delete on table customer_device violates foreign key"), {
                code: "23503",
                constraint: "contract_device_customer_device_fk",
            })
        );

        const response = await request(buildApp()).delete("/api/customer-devices/5");

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Impossibile eliminare il dispositivo: è ancora collegato a uno o più contratti."
        );
    });

    it("elimina un dispositivo esistente", async () => {
        vi.mocked(deleteCustomerDeviceById).mockResolvedValue([device] as never);

        expect((await request(buildApp()).delete("/api/customer-devices/5")).status).toBe(200);
    });
});
