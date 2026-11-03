import path from "node:path";
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
    phase: null,
    build: null,
    currentCommit: "abc123",
    currentVersion: "v1.0.0",
    remoteCommit: "abc123",
    remoteVersion: null,
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

    /**
     * Lo stato sta in una cartella di root montata in sola lettura, non accanto ai trigger
     * che scrive il backend: lì un link messo dal container veniva seguito dagli script di root.
     */
    it("legge lo stato da update-status, non dalla cartella dei trigger", async () => {
        await getUpdateStatus();

        const [statusPath] = readFile.mock.calls[0] as [string];
        expect(path.basename(path.dirname(statusPath))).toBe("update-status");
        expect(path.basename(statusPath)).toBe("status.json");
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

    it("legge la versione installata e quella disponibile", async () => {
        readFile.mockResolvedValue(
            JSON.stringify(
                storedStatus({ currentVersion: "v1.0.0 + 2 commit", remoteVersion: "v1.1.0", updateAvailable: true })
            )
        );

        const status = await getUpdateStatus();

        expect(status.currentVersion).toBe("v1.0.0 + 2 commit");
        expect(status.remoteVersion).toBe("v1.1.0");
    });

    // Un server aggiornato solo a metà (script nuovi, stato scritto da quelli vecchi) non ha i campi.
    it("lascia a null le versioni mancanti o non testuali", async () => {
        readFile.mockResolvedValue(JSON.stringify({ state: "idle", currentVersion: 1, remoteVersion: {} }));

        const status = await getUpdateStatus();

        expect(status.currentVersion).toBeNull();
        expect(status.remoteVersion).toBeNull();
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

    it("scarta una phase non tra i valori ammessi", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedStatus({ phase: "boh" as never })));

        const status = await getUpdateStatus();

        expect(status.phase).toBeNull();
    });

    it("legge l'avanzamento della ricostruzione", async () => {
        const build = { service: "backend", step: 5, total: 9, name: "RUN npm ci" };
        readFile.mockResolvedValue(JSON.stringify(storedStatus({ state: "running", phase: "build", build })));

        expect((await getUpdateStatus()).build).toEqual(build);
    });

    it("accetta lo status.json scritto dallo script vecchio, senza avanzamento", async () => {
        const { build: _build, ...old } = storedStatus({ state: "running", phase: "build" });
        readFile.mockResolvedValue(JSON.stringify(old));

        expect((await getUpdateStatus()).build).toBeNull();
    });

    it.each([
        ["un testo", "boom"],
        ["un passo oltre il totale", { service: "backend", step: 9, total: 5, name: "x" }],
        ["un passo zero", { service: "backend", step: 0, total: 5, name: "x" }],
        ["un passo non intero", { service: "backend", step: "5", total: 9, name: "x" }],
        ["un servizio mancante", { step: 5, total: 9, name: "x" }],
    ])("scarta un avanzamento malformato (%s)", async (_label, build) => {
        readFile.mockResolvedValue(JSON.stringify(storedStatus({ build: build as never })));

        expect((await getUpdateStatus()).build).toBeNull();
    });

    it("accorcia i testi troppo lunghi dell'avanzamento", async () => {
        const build = { service: "s".repeat(100), step: 1, total: 2, name: "n".repeat(500) };
        readFile.mockResolvedValue(JSON.stringify(storedStatus({ build })));

        const result = (await getUpdateStatus()).build;
        expect(result?.service).toHaveLength(40);
        expect(result?.name).toHaveLength(80);
    });

    it("preserva una phase valida mentre l'aggiornamento è in corso", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedStatus({ state: "running", phase: "build" })));

        const status = await getUpdateStatus();

        expect(status.phase).toBe("build");
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
        // I trigger restano nella cartella del backend: le unit systemd sull'host guardano lì.
        const [triggerPath] = writeFile.mock.calls[0] as [string];
        expect(path.basename(path.dirname(triggerPath))).toBe("update-signal");
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
