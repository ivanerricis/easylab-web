import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `updateManager` non tocca mai git/docker: legge/scrive solo file di segnale letti da uno
 * script sull'host (vedi il commento nel sorgente). Qui si mocka `node:fs` come in
 * `emailManager.test.ts`, così nessun trigger reale viene mai creato durante i test.
 */
const readFile = vi.fn();
const writeFile = vi.fn();
const mkdir = vi.fn();

vi.mock("node:fs", () => ({
    default: {
        promises: {
            readFile: (...args: unknown[]) => readFile(...args),
            writeFile: (...args: unknown[]) => writeFile(...args),
            mkdir: (...args: unknown[]) => mkdir(...args),
        },
    },
}));

import {
    getUpdateStatus,
    requestUpdate,
    requestUpdateCheck,
    UpdateManagerError,
    type UpdateStatus,
} from "./updateManager";

const storedStatus = (overrides: Partial<UpdateStatus> = {}): UpdateStatus => ({
    state: "idle",
    currentCommit: "abc123",
    remoteCommit: "abc123",
    updateAvailable: false,
    lastCheckedAt: "2026-09-10T08:00:00Z",
    lastUpdateAt: null,
    lastUpdateStatus: null,
    lastError: null,
    log: null,
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    // Nessun file di stato ancora scritto dall'host: stato "unknown" di default.
    readFile.mockRejectedValue(new Error("ENOENT"));
    writeFile.mockResolvedValue(undefined);
    mkdir.mockResolvedValue(undefined);
});

describe("getUpdateStatus", () => {
    it("torna lo stato 'unknown' di default quando il file non esiste ancora", async () => {
        const status = await getUpdateStatus();

        expect(status.state).toBe("unknown");
        expect(status.updateAvailable).toBe(false);
    });

    it("legge e normalizza lo stato scritto dallo script sull'host", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedStatus({ state: "running" })));

        const status = await getUpdateStatus();

        expect(status.state).toBe("running");
        expect(status.currentCommit).toBe("abc123");
    });

    // status.json è scritto da uno script esterno: va trattato come input non fidato,
    // non come qualcosa che possa far esplodere il servizio.
    it("ripiega su 'unknown' quando lo stato nel file non è uno di quelli validi", async () => {
        readFile.mockResolvedValue(JSON.stringify({ state: "boh", currentCommit: 42 }));

        const status = await getUpdateStatus();

        expect(status.state).toBe("unknown");
        expect(status.currentCommit).toBeNull();
    });

    it("scarta un lastUpdateStatus non tra i valori ammessi", async () => {
        readFile.mockResolvedValue(JSON.stringify({ state: "idle", lastUpdateStatus: "boh" }));

        const status = await getUpdateStatus();

        expect(status.lastUpdateStatus).toBeNull();
    });

    it("preserva un lastUpdateStatus valido ('success' o 'failed')", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedStatus({ lastUpdateStatus: "failed" })));

        const status = await getUpdateStatus();

        expect(status.lastUpdateStatus).toBe("failed");
    });

    it("un JSON illeggibile non fa fallire la chiamata: torna lo stato di default", async () => {
        readFile.mockResolvedValue("{non-json");

        const status = await getUpdateStatus();

        expect(status.state).toBe("unknown");
    });
});

describe("requestUpdate", () => {
    it("rifiuta con 409 se un aggiornamento è già in corso, senza creare nessun trigger", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedStatus({ state: "running" })));

        await expect(requestUpdate()).rejects.toBeInstanceOf(UpdateManagerError);
        await expect(requestUpdate()).rejects.toMatchObject({ statusCode: 409 });
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("crea il trigger di apply (non quello di check) quando non c'è nulla in corso", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedStatus({ state: "idle" })));

        await requestUpdate();

        expect(mkdir).toHaveBeenCalledWith(expect.stringContaining("update-signal"), { recursive: true });
        expect(writeFile).toHaveBeenCalledWith(expect.stringContaining("apply.trigger"), "", "utf-8");
        expect(writeFile).not.toHaveBeenCalledWith(
            expect.stringContaining("check.trigger"),
            expect.anything(),
            expect.anything()
        );
    });

    it("ritorna lo stato aggiornato dopo aver creato il trigger", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedStatus({ state: "idle" })));

        const status = await requestUpdate();

        expect(status.state).toBe("idle");
    });
});

describe("requestUpdateCheck", () => {
    it("rifiuta con 409 se un aggiornamento è già in corso", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedStatus({ state: "running" })));

        await expect(requestUpdateCheck()).rejects.toMatchObject({ statusCode: 409 });
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("crea il trigger di check (non quello di apply)", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedStatus({ state: "idle" })));

        await requestUpdateCheck();

        expect(writeFile).toHaveBeenCalledWith(expect.stringContaining("check.trigger"), "", "utf-8");
        expect(writeFile).not.toHaveBeenCalledWith(
            expect.stringContaining("apply.trigger"),
            expect.anything(),
            expect.anything()
        );
    });
});
