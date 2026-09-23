import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { NextFunction, Request, Response } from "express";

vi.mock("./clientIp", () => ({
    getClientIp: vi.fn(() => "1.2.3.4"),
}));

vi.mock("../services/logManager", () => ({
    appendUserActionLog: vi.fn().mockResolvedValue(undefined),
    getDayKey: (date: Date) => date.toISOString().slice(0, 10),
}));

import { appendUserActionLog } from "../services/logManager";
import { getClientIp } from "./clientIp";
import { userActionLogger } from "./userActionLogger";

const createResponse = (statusCode: number, locals: Record<string, unknown> = {}) => {
    const emitter = new EventEmitter() as unknown as Response & EventEmitter;
    (emitter as unknown as { statusCode: number }).statusCode = statusCode;
    (emitter as unknown as { locals: Record<string, unknown> }).locals = locals;
    return emitter;
};

const createRequest = (method: string, originalUrl: string, user?: { username: string }) =>
    ({ method, originalUrl, user }) as Request;

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe("userActionLogger", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("registra una POST riuscita con verbo 'creato'", async () => {
        const res = createResponse(201);

        userActionLogger(createRequest("POST", "/api/devices", { username: "mario" }), res, vi.fn() as NextFunction);
        res.emit("finish");
        await flushMicrotasks();

        expect(appendUserActionLog).toHaveBeenCalledOnce();
        const line = vi.mocked(appendUserActionLog).mock.calls[0][0];
        expect(line).toContain("action=creato /api/devices");
        expect(line).toContain("user=mario");
        expect(line).toContain("ip=1.2.3.4");
        expect(line).not.toContain("error=");
    });

    it("aggiunge il messaggio d'errore quando lo status è >= 400", async () => {
        const res = createResponse(404, { apiErrorMessage: "Device not found" });

        userActionLogger(createRequest("DELETE", "/api/devices/999"), res, vi.fn() as NextFunction);
        res.emit("finish");
        await flushMicrotasks();

        const line = vi.mocked(appendUserActionLog).mock.calls[0][0];
        expect(line).toContain("action=eliminato /api/devices/999");
        expect(line).toContain("error=Device not found");
    });

    it("usa lo status come messaggio d'errore quando apiErrorMessage manca", async () => {
        const res = createResponse(500);

        userActionLogger(createRequest("PUT", "/api/devices/1"), res, vi.fn() as NextFunction);
        res.emit("finish");
        await flushMicrotasks();

        expect(vi.mocked(appendUserActionLog).mock.calls[0][0]).toContain("error=HTTP 500");
    });

    it("usa '-' come utente quando la richiesta non è autenticata", async () => {
        const res = createResponse(200);

        userActionLogger(createRequest("POST", "/api/auth/login"), res, vi.fn() as NextFunction);
        res.emit("finish");
        await flushMicrotasks();

        expect(vi.mocked(appendUserActionLog).mock.calls[0][0]).toContain("user=-");
    });

    it("ripulisce lo username da pipe e a-capo prima di scriverlo nel log", async () => {
        const res = createResponse(200);

        userActionLogger(
            createRequest("POST", "/api/devices", { username: "mario | rossi\nadmin" }),
            res,
            vi.fn() as NextFunction
        );
        res.emit("finish");
        await flushMicrotasks();

        const line = vi.mocked(appendUserActionLog).mock.calls[0][0];
        expect(line).toContain("user=mario / rossi admin | action=");
    });

    it("ripulisce l'IP da pipe e a-capo prima di scriverlo nel log", async () => {
        vi.mocked(getClientIp).mockReturnValueOnce("1.2.3.4 | rossi\nadmin");
        const res = createResponse(200);

        userActionLogger(createRequest("POST", "/api/devices", { username: "mario" }), res, vi.fn() as NextFunction);
        res.emit("finish");
        await flushMicrotasks();

        const line = vi.mocked(appendUserActionLog).mock.calls[0][0];
        expect(line).toContain("ip=1.2.3.4 / rossi admin | user=");
    });

    it("non registra le GET senza un'etichetta dedicata", () => {
        const res = createResponse(200);

        userActionLogger(createRequest("GET", "/api/devices"), res, vi.fn() as NextFunction);
        res.emit("finish");

        expect(appendUserActionLog).not.toHaveBeenCalled();
    });

    it("registra le GET di download sensibili con un'etichetta dedicata", async () => {
        const res = createResponse(200, {});

        userActionLogger(
            createRequest("GET", "/api/reports/42/print", { username: "mario" }),
            res,
            vi.fn() as NextFunction
        );
        res.emit("finish");
        await flushMicrotasks();

        expect(appendUserActionLog).toHaveBeenCalledOnce();
        expect(vi.mocked(appendUserActionLog).mock.calls[0][0]).toContain("action=download ricevuta report");
    });

    /**
     * D7: la regola era registrata per GET, ma la rotta (routes/settings.ts) è una POST: non
     * scattava mai, e l'esportazione della chiave finiva nel registro come il generico "creato
     * /api/settings/backup/key" invece che con l'etichetta dedicata.
     */
    it("registra l'esportazione della chiave di backup con la sua etichetta, sulla POST reale della rotta", async () => {
        const res = createResponse(200, {});

        userActionLogger(
            createRequest("POST", "/api/settings/backup/key", { username: "mario" }),
            res,
            vi.fn() as NextFunction
        );
        res.emit("finish");
        await flushMicrotasks();

        expect(appendUserActionLog).toHaveBeenCalledOnce();
        expect(vi.mocked(appendUserActionLog).mock.calls[0][0]).toContain("action=esportazione chiave di backup");
    });

    it("una GET sulla stessa rotta non scatterebbe più (non è la rotta reale)", () => {
        const res = createResponse(200);

        userActionLogger(createRequest("GET", "/api/settings/backup/key"), res, vi.fn() as NextFunction);
        res.emit("finish");

        expect(appendUserActionLog).not.toHaveBeenCalled();
    });

    /**
     * Prima gli export CSV e i resoconti PDF non finivano nel registro: sono GET senza
     * un'etichetta dedicata, e "non registra le GET senza un'etichetta dedicata" qui sopra
     * vale anche per loro. L'export dei report porta con sé la colonna Password.
     */
    it("registra l'export CSV dei report con la sua etichetta", async () => {
        const res = createResponse(200, {});

        userActionLogger(
            createRequest("GET", "/api/reports/export.csv", { username: "mario" }),
            res,
            vi.fn() as NextFunction
        );
        res.emit("finish");
        await flushMicrotasks();

        expect(appendUserActionLog).toHaveBeenCalledOnce();
        expect(vi.mocked(appendUserActionLog).mock.calls[0][0]).toContain("action=esportazione CSV report");
    });

    it("registra l'export CSV di interventi e clienti con la loro etichetta", async () => {
        const interventionsRes = createResponse(200);
        userActionLogger(
            createRequest("GET", "/api/interventions/export.csv"),
            interventionsRes,
            vi.fn() as NextFunction
        );
        interventionsRes.emit("finish");
        await flushMicrotasks();

        expect(vi.mocked(appendUserActionLog).mock.calls[0][0]).toContain("action=esportazione CSV interventi");

        const customersRes = createResponse(200);
        userActionLogger(createRequest("GET", "/api/customers/export.csv"), customersRes, vi.fn() as NextFunction);
        customersRes.emit("finish");
        await flushMicrotasks();

        expect(vi.mocked(appendUserActionLog).mock.calls[1][0]).toContain("action=esportazione CSV clienti");
    });

    it("registra la stampa dei resoconti PDF di cliente e collaboratore con la loro etichetta", async () => {
        const cases: [string, string][] = [
            ["/api/customers/7/reports/print", "stampa resoconto report cliente"],
            ["/api/customers/7/interventions/print", "stampa resoconto interventi cliente"],
            ["/api/collaborators/3/reports/print", "stampa resoconto report collaboratore"],
            ["/api/collaborators/3/interventions/print", "stampa resoconto interventi collaboratore"],
        ];

        for (const [url, label] of cases) {
            const res = createResponse(200);
            userActionLogger(createRequest("GET", url), res, vi.fn() as NextFunction);
            res.emit("finish");
            await flushMicrotasks();

            expect(vi.mocked(appendUserActionLog).mock.calls.at(-1)?.[0]).toContain(`action=${label}`);
        }
    });

    /**
     * Il ripristino sovrascrive l'intero database: senza un'etichetta a sé finiva nel registro
     * come il generico "creato /api/settings/backup/restore", fuorviante per l'azione più
     * delicata di tutta l'app.
     */
    it("registra il ripristino del backup, da file esistente o caricato, con la sua etichetta", async () => {
        const fromExisting = createResponse(200);
        userActionLogger(
            createRequest("POST", "/api/settings/backup/restore", { username: "admin" }),
            fromExisting,
            vi.fn() as NextFunction
        );
        fromExisting.emit("finish");
        await flushMicrotasks();

        expect(vi.mocked(appendUserActionLog).mock.calls[0][0]).toContain("action=ripristino backup");

        const fromUpload = createResponse(200);
        userActionLogger(
            createRequest("POST", "/api/settings/backup/restore/upload", { username: "admin" }),
            fromUpload,
            vi.fn() as NextFunction
        );
        fromUpload.emit("finish");
        await flushMicrotasks();

        expect(vi.mocked(appendUserActionLog).mock.calls[1][0]).toContain("action=ripristino backup da file caricato");
    });

    /**
     * Un admin che guarda le sessioni di un altro utente è una GET, quindi fuori dal registro
     * come ogni altra consultazione senza questa regola — ma è proprio il tipo di "chi ha
     * guardato l'attività di chi" per cui il registro esiste.
     */
    it("registra la consultazione delle sessioni di un utente da parte di un admin", async () => {
        const res = createResponse(200);

        userActionLogger(
            createRequest("GET", "/api/users/7/sessions", { username: "admin" }),
            res,
            vi.fn() as NextFunction
        );
        res.emit("finish");
        await flushMicrotasks();

        expect(appendUserActionLog).toHaveBeenCalledOnce();
        expect(vi.mocked(appendUserActionLog).mock.calls[0][0]).toContain("action=consultazione sessioni di un utente");
    });

    /**
     * Distinta dalla disattivazione della propria 2FA (`DELETE /api/auth/2fa`, già etichettata
     * sopra): qui è un admin che la toglie a un altro utente, un'azione che abbassa la
     * sicurezza di un account che non è il suo.
     */
    it("registra la disattivazione della 2FA di un altro utente con un'etichetta distinta dalla propria", async () => {
        const res = createResponse(200);

        userActionLogger(
            createRequest("POST", "/api/users/7/disable-2fa", { username: "admin" }),
            res,
            vi.fn() as NextFunction
        );
        res.emit("finish");
        await flushMicrotasks();

        expect(appendUserActionLog).toHaveBeenCalledOnce();
        expect(vi.mocked(appendUserActionLog).mock.calls[0][0]).toContain("action=disattivazione 2FA di un utente");
    });

    it("usa etichette dedicate per login e logout invece del verbo generico", async () => {
        const loginRes = createResponse(200);
        userActionLogger(createRequest("POST", "/api/auth/login"), loginRes, vi.fn() as NextFunction);
        loginRes.emit("finish");
        await flushMicrotasks();

        expect(vi.mocked(appendUserActionLog).mock.calls[0][0]).toContain("action=tentativo di accesso");

        const logoutRes = createResponse(204);
        userActionLogger(
            createRequest("POST", "/api/auth/logout", { username: "mario" }),
            logoutRes,
            vi.fn() as NextFunction
        );
        logoutRes.emit("finish");
        await flushMicrotasks();

        expect(vi.mocked(appendUserActionLog).mock.calls[1][0]).toContain("action=disconnessione");
    });

    it("non registra le rotte fuori da /api", () => {
        const res = createResponse(200);

        userActionLogger(createRequest("POST", "/login"), res, vi.fn() as NextFunction);
        res.emit("finish");

        expect(appendUserActionLog).not.toHaveBeenCalled();
    });

    it("non registra /api/health", () => {
        const res = createResponse(200);

        userActionLogger(createRequest("POST", "/api/health"), res, vi.fn() as NextFunction);
        res.emit("finish");

        expect(appendUserActionLog).not.toHaveBeenCalled();
    });

    it("chiama sempre next() in modo sincrono", () => {
        const next = vi.fn();

        userActionLogger(createRequest("POST", "/api/devices"), createResponse(200), next as NextFunction);

        expect(next).toHaveBeenCalledOnce();
    });
});
