import { beforeEach, describe, expect, it, vi } from "vitest";

const fsPromisesMock = vi.hoisted(() => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
}));

vi.mock("node:fs", () => ({
    default: { promises: fsPromisesMock },
}));

const secretCryptoMock = vi.hoisted(() => ({
    decryptSecret: vi.fn(),
    encryptSecret: vi.fn(),
}));

vi.mock("./secretCrypto", () => secretCryptoMock);

const emailManagerMock = vi.hoisted(() => ({
    isEmailConfigured: vi.fn(),
    isStoredEmailPasswordUsable: vi.fn(),
}));

vi.mock("./emailManager", () => emailManagerMock);

import { BackupManagerError } from "./backupError";
import { settingsFilePath } from "./backupFiles";
import {
    defaultState,
    findSecretsToReconfigure,
    invalidateBackupStateCache,
    loadState,
    persistState,
    sanitizeState,
    setNextRunIfNeeded,
    toPublicState,
} from "./backupState";

beforeEach(() => {
    vi.clearAllMocks();
    invalidateBackupStateCache();
    emailManagerMock.isStoredEmailPasswordUsable.mockResolvedValue(true);
    emailManagerMock.isEmailConfigured.mockResolvedValue(false);
});

describe("sanitizeState", () => {
    it("applica i default quando l'input e' vuoto", () => {
        expect(sanitizeState({})).toEqual(defaultState);
    });

    it.each([0, -1, 366, 1.5])("rifiuta frequencyDays fuori dal range 1-365 (%s)", (frequencyDays) => {
        expect(() => sanitizeState({ frequencyDays })).toThrow(BackupManagerError);
    });

    it.each([0, -1, 366])("rifiuta maxBackupsToKeep fuori dal range 1-365 (%s)", (maxBackupsToKeep) => {
        expect(() => sanitizeState({ maxBackupsToKeep })).toThrow(BackupManagerError);
    });

    it.each([0, -1, 65536])("rifiuta smbPort fuori dal range di una porta valida (%s)", (smbPort) => {
        expect(() => sanitizeState({ smbPort })).toThrow(BackupManagerError);
    });

    it.each(["25:00", "9:00", "12:60", "non-un-orario"])("rifiuta un runAt malformato (%s)", (runAt) => {
        expect(() => sanitizeState({ runAt })).toThrow(BackupManagerError);
    });

    it("ignora l'outputDir dell'input: e' sempre quello configurato dall'app", () => {
        const result = sanitizeState({ outputDir: "/percorso/arbitrario" });
        expect(result.outputDir).toBe(defaultState.outputDir);
    });

    it("ripulisce gli spazi dai campi SMB testuali", () => {
        const result = sanitizeState({ smbHost: "  nas.local  ", smbShare: " backup " });
        expect(result.smbHost).toBe("nas.local");
        expect(result.smbShare).toBe("backup");
    });

    it("riporta a 'idle' un lastRunStatus non fra i valori ammessi", () => {
        // Cast deliberato: simula un file di stato corrotto o di una versione precedente.
        const result = sanitizeState({ lastRunStatus: "boh" as unknown as "idle" });
        expect(result.lastRunStatus).toBe("idle");
    });
});

describe("setNextRunIfNeeded", () => {
    it("azzera nextRunAt quando l'automatico e' disattivato", () => {
        const state = { ...defaultState, autoEnabled: false, nextRunAt: "2026-01-01T00:00:00.000Z" };
        setNextRunIfNeeded(state, new Date());
        expect(state.nextRunAt).toBeNull();
    });

    it("pianifica oggi stesso se l'orario configurato deve ancora arrivare", () => {
        const state = { ...defaultState, autoEnabled: true, runAt: "23:59", frequencyDays: 1 };
        const reference = new Date(2026, 0, 1, 10, 0, 0);

        setNextRunIfNeeded(state, reference);

        const next = new Date(state.nextRunAt as string);
        expect(next.getDate()).toBe(1);
        expect(next.getHours()).toBe(23);
    });

    it("rimanda di frequencyDays se l'orario configurato e' gia' passato oggi", () => {
        const state = { ...defaultState, autoEnabled: true, runAt: "00:01", frequencyDays: 3 };
        const reference = new Date(2026, 0, 1, 10, 0, 0);

        setNextRunIfNeeded(state, reference);

        const next = new Date(state.nextRunAt as string);
        expect(next.getDate()).toBe(4);
    });
});

describe("persistState", () => {
    it("crea la cartella e scrive lo stato come JSON con newline finale", async () => {
        fsPromisesMock.mkdir.mockResolvedValueOnce(undefined);
        fsPromisesMock.writeFile.mockResolvedValueOnce(undefined);

        await persistState(defaultState);

        expect(fsPromisesMock.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
        const [writtenPath, writtenContent, encoding] = fsPromisesMock.writeFile.mock.calls[0];
        expect(writtenPath).toBe(settingsFilePath);
        expect(writtenContent.endsWith("\n")).toBe(true);
        expect(JSON.parse(writtenContent)).toEqual(defaultState);
        expect(encoding).toBe("utf-8");
    });
});

describe("loadState", () => {
    it("legge e sanifica lo stato salvato su disco", async () => {
        fsPromisesMock.readFile.mockResolvedValueOnce(JSON.stringify({ frequencyDays: 7, runAt: "03:30" }));

        const state = await loadState();

        expect(state.frequencyDays).toBe(7);
        expect(state.runAt).toBe("03:30");
    });

    it("usa la cache dalla seconda chiamata in poi, senza rileggere il file", async () => {
        fsPromisesMock.readFile.mockResolvedValueOnce(JSON.stringify(defaultState));

        await loadState();
        await loadState();

        expect(fsPromisesMock.readFile).toHaveBeenCalledTimes(1);
    });

    it("se il file manca, ripiega sui default e li persiste", async () => {
        fsPromisesMock.readFile.mockRejectedValueOnce(new Error("ENOENT"));
        fsPromisesMock.mkdir.mockResolvedValueOnce(undefined);
        fsPromisesMock.writeFile.mockResolvedValueOnce(undefined);

        const state = await loadState();

        expect(state).toEqual(defaultState);
        expect(fsPromisesMock.writeFile).toHaveBeenCalledTimes(1);
    });

    it("invalidateBackupStateCache forza una rilettura da disco", async () => {
        fsPromisesMock.readFile.mockResolvedValue(JSON.stringify(defaultState));

        await loadState();
        invalidateBackupStateCache();
        await loadState();

        expect(fsPromisesMock.readFile).toHaveBeenCalledTimes(2);
    });
});

describe("findSecretsToReconfigure", () => {
    it("torna vuoto quando la password email e' leggibile e non c'e' password NAS", async () => {
        expect(await findSecretsToReconfigure(defaultState)).toEqual([]);
    });

    it("segnala la password email quando non e' piu' leggibile (chiave diversa dopo un ripristino)", async () => {
        emailManagerMock.isStoredEmailPasswordUsable.mockResolvedValueOnce(false);

        expect(await findSecretsToReconfigure(defaultState)).toContain("Password email (SMTP)");
    });

    it("segnala la password NAS quando la decifratura fallisce", async () => {
        secretCryptoMock.decryptSecret.mockRejectedValueOnce(new Error("bad auth tag"));

        const state = { ...defaultState, smbPasswordEncrypted: "iv:tag:data" };

        expect(await findSecretsToReconfigure(state)).toContain("Password NAS (SMB)");
    });

    it("non segnala la password NAS se e' ancora decifrabile", async () => {
        secretCryptoMock.decryptSecret.mockResolvedValueOnce("segreta");

        const state = { ...defaultState, smbPasswordEncrypted: "iv:tag:data" };

        expect(await findSecretsToReconfigure(state)).not.toContain("Password NAS (SMB)");
    });
});

describe("toPublicState", () => {
    it("nasconde la password cifrata e aggiunge i campi derivati", async () => {
        emailManagerMock.isEmailConfigured.mockResolvedValueOnce(true);
        const state = { ...defaultState, smbPasswordEncrypted: "iv:tag:data" };

        const publicState = await toPublicState(state);

        expect(publicState).not.toHaveProperty("smbPasswordEncrypted");
        expect(publicState.smbPasswordSet).toBe(true);
        expect(publicState.emailConfigured).toBe(true);
        expect(publicState.restoreSecretsToReconfigure).toEqual([]);
    });

    it("smbPasswordSet e' false quando non c'e' alcuna password salvata", async () => {
        const publicState = await toPublicState(defaultState);
        expect(publicState.smbPasswordSet).toBe(false);
    });
});
