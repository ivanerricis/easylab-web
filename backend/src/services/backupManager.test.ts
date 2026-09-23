import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupSettingsState } from "./backupState";

/**
 * Mock parziali: nomi dei file, ordinamento e messaggi SMB restano veri (li coprono i test
 * in cima al file), mentre tutto ciò che tocca disco, processi, NAS e posta è sostituito.
 * Lo stato è un oggetto del test, restituito da `loadState` come farebbe la cache vera:
 * `runBackupNow` e `updateBackupSettings` lo modificano sul posto.
 */
let state: BackupSettingsState;

// Come il vero `store.save` (jsonSettingsStore.ts): scrive e aggiorna la cache allo stesso
// oggetto passato. Da quando `updateBackupSettings` costruisce un `next` nuovo invece di
// mutare `current` sul posto (D3, vedi CHANGELOG), `state` qui non è più lo stesso riferimento
// modificato "in place": bisogna che persistState lo rimpiazzi, o le asserzioni sotto
// continuerebbero a leggere lo stato di prima anche quando il salvataggio è andato a buon fine.
const persistState = vi.fn<(value: BackupSettingsState) => Promise<void>>((value) => {
    state = value;
    return Promise.resolve();
});

vi.mock("./backupState", async () => {
    const actual = await vi.importActual<typeof import("./backupState")>("./backupState");
    return {
        ...actual,
        loadState: () => Promise.resolve(state),
        persistState: (value: BackupSettingsState) => persistState(value),
    };
});

const createBackupArchive = vi.fn<(archivePath: string) => Promise<void>>(() => Promise.resolve());

vi.mock("./backupProcess", () => ({
    createBackupArchive: (archivePath: string) => createBackupArchive(archivePath),
}));

const pruneOldBackups = vi.fn<(outputDir: string, keep: number) => Promise<void>>(() => Promise.resolve());

vi.mock("./backupFiles", async () => {
    const actual = await vi.importActual<typeof import("./backupFiles")>("./backupFiles");
    return { ...actual, pruneOldBackups: (outputDir: string, keep: number) => pruneOldBackups(outputDir, keep) };
});

const uploadDumpToSmb = vi.fn<(config: unknown, localFilePath: string) => Promise<void>>(() => Promise.resolve());
const pruneOldSmbBackups = vi.fn<(config: unknown, keep: number) => Promise<void>>(() => Promise.resolve());

vi.mock("./backupSmb", async () => {
    const actual = await vi.importActual<typeof import("./backupSmb")>("./backupSmb");
    return {
        ...actual,
        uploadDumpToSmb: (config: unknown, localFilePath: string) => uploadDumpToSmb(config, localFilePath),
        pruneOldSmbBackups: (config: unknown, keep: number) => pruneOldSmbBackups(config, keep),
    };
});

vi.mock("./secretCrypto", () => ({
    encryptSecret: (value: string) => Promise.resolve(`cifrato:${value}`),
    decryptSecret: (payload: string) => Promise.resolve(payload.replace(/^cifrato:/, "")),
}));

const isEmailConfigured = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));
const sendEmail = vi.fn<(input: { to: string; subject: string; text: string }) => Promise<void>>(() =>
    Promise.resolve()
);

vi.mock("./emailManager", () => ({
    isEmailConfigured: () => isEmailConfigured(),
    isStoredEmailPasswordUsable: () => Promise.resolve(true),
    sendEmail: (input: { to: string; subject: string; text: string }) => sendEmail(input),
}));

const getCompanySettings = vi.fn(() => Promise.resolve({ name: "Laboratorio", email: "lab@example.com" }));

vi.mock("./companyManager", () => ({
    getCompanySettings: () => getCompanySettings(),
}));

const recordNotification = vi.fn();

vi.mock("./notificationManager", () => ({
    recordNotification: (input: unknown) => recordNotification(input),
}));

import {
    BackupManagerError,
    composeSmbErrorMessage,
    computeSmbFilesToDelete,
    getBackupDumpPath,
    getBackupSortKey,
    isAlreadyExistsSmbError,
    restoreBackupFromUpload,
    runBackupNow,
    sortBackupFileNamesByAge,
    startBackupScheduler,
    stopBackupScheduler,
    updateBackupSettings,
    type SmbConnectionConfig,
} from "./backupManager";
import { defaultState } from "./backupState";

// Il nome file è l'unico filtro fra la richiesta e il filesystem: questi test
// coprono sia la retrocompatibilità col formato storico sia il traversal.
describe("getBackupDumpPath", () => {
    const expectStatus = async (fileName: string, statusCode: number) => {
        try {
            await getBackupDumpPath(fileName);
            expect.unreachable(`${fileName} avrebbe dovuto fallire`);
        } catch (error) {
            expect(error).toBeInstanceOf(BackupManagerError);
            expect((error as BackupManagerError).statusCode).toBe(statusCode);
        }
    };

    it("accetta il formato storico .sql (404: nome valido, file assente)", async () => {
        await expectStatus("db-dump-20260101-000000.sql", 404);
    });

    it("accetta il nuovo formato archivio .tar.gz", async () => {
        await expectStatus("db-backup-20260101-000000.tar.gz", 404);
    });

    it("rifiuta un nome che non segue nessuno dei due schemi", async () => {
        await expectStatus("qualsiasi-file.sql", 400);
        await expectStatus("db-backup-20260101-000000.zip", 400);
    });

    it("rifiuta il path traversal", async () => {
        await expectStatus("../../etc/passwd", 400);
        await expectStatus("../db-dump-20260101-000000.sql", 400);
    });

    it("rifiuta una data non conforme allo schema", async () => {
        await expectStatus("db-dump-2026-01-01.sql", 400);
    });
});

describe("ordinamento dei backup", () => {
    // Regressione reale: con 14 .sql legacy e la retention a 14, l'archivio appena
    // creato finiva in testa all'ordine alfabetico ('db-backup-' < 'db-dump-') e
    // veniva cancellato subito dopo essere stato scritto. L'upload sul NAS falliva
    // poi con "does not exist".
    it("mette il nuovo archivio per ultimo, non per primo", () => {
        const files = [
            "db-dump-20260701-020000.sql",
            "db-backup-20260729-113813.tar.gz",
            "db-dump-20260710-020000.sql",
        ];

        expect(sortBackupFileNamesByAge(files).at(-1)).toBe("db-backup-20260729-113813.tar.gz");
    });

    it("non cancella il piu recente quando la retention taglia i piu vecchi", () => {
        const legacy = Array.from(
            { length: 14 },
            (_, i) => `db-dump-202607${String(i + 1).padStart(2, "0")}-020000.sql`
        );
        const fresh = "db-backup-20260729-113813.tar.gz";

        const ordered = sortBackupFileNamesByAge([...legacy, fresh]);
        const toDelete = ordered.slice(0, ordered.length - 14);

        expect(toDelete).not.toContain(fresh);
        expect(toDelete).toEqual(["db-dump-20260701-020000.sql"]);
    });

    it("ordina per data anche fra formati diversi", () => {
        const ordered = sortBackupFileNamesByAge([
            "db-backup-20260729-113813.tar.gz",
            "db-dump-20260801-020000.sql",
            "db-backup-20260101-000000.tar.gz",
        ]);

        expect(ordered).toEqual([
            "db-backup-20260101-000000.tar.gz",
            "db-backup-20260729-113813.tar.gz",
            "db-dump-20260801-020000.sql",
        ]);
    });

    it("estrae il timestamp da entrambi i formati", () => {
        expect(getBackupSortKey("db-backup-20260729-113813.tar.gz")).toBe("20260729-113813");
        expect(getBackupSortKey("db-dump-20260729-113813.sql")).toBe("20260729-113813");
    });
});

describe("computeSmbFilesToDelete", () => {
    // Stessa retention della cartella locale (pruneOldBackups), applicata ai nomi
    // elencati sul NAS: il piu recente non deve mai finire fra quelli da cancellare.
    it("tiene solo i piu recenti fino al limite di retention", () => {
        const files = [
            "db-backup-20260701-020000.tar.gz",
            "db-backup-20260702-020000.tar.gz",
            "db-backup-20260703-020000.tar.gz",
        ];

        expect(computeSmbFilesToDelete(files, 2)).toEqual(["db-backup-20260701-020000.tar.gz"]);
    });

    it("non cancella nulla se sotto la soglia", () => {
        const files = ["db-backup-20260701-020000.tar.gz", "db-backup-20260702-020000.tar.gz"];

        expect(computeSmbFilesToDelete(files, 14)).toEqual([]);
    });
});

describe("composeSmbErrorMessage", () => {
    // smbclient scrive le diagnostiche su stdout: ignorarlo lasciava come unico
    // messaggio "terminato con codice 1", inutile da leggere e soprattutto tale da
    // far sembrare un errore la cartella remota gia esistente.
    it("usa stdout quando stderr e vuoto", () => {
        expect(composeSmbErrorMessage("", "NT_STATUS_LOGON_FAILURE", 1)).toBe("NT_STATUS_LOGON_FAILURE");
    });

    it("unisce i due flussi quando ci sono entrambi", () => {
        expect(composeSmbErrorMessage("warn", "NT_STATUS_ACCESS_DENIED", 1)).toBe("warn | NT_STATUS_ACCESS_DENIED");
    });

    it("ripiega sul codice di uscita solo se non c'e output", () => {
        expect(composeSmbErrorMessage("  ", "  ", 1)).toBe("smbclient terminato con codice 1");
    });

    it("conserva il codice di collisione, che serve a riconoscere la cartella esistente", () => {
        const message = composeSmbErrorMessage("", "NT_STATUS_OBJECT_NAME_COLLISION making dir", 1);

        expect(isAlreadyExistsSmbError(message)).toBe(true);
    });
});

describe("isAlreadyExistsSmbError", () => {
    it("riconosce entrambi i codici usati dalle varie versioni di Samba", () => {
        expect(isAlreadyExistsSmbError("NT_STATUS_OBJECT_NAME_COLLISION")).toBe(true);
        expect(isAlreadyExistsSmbError("NT_STATUS_OBJECT_NAME_EXISTS")).toBe(true);
    });

    it("non scambia per collisione un errore diverso", () => {
        expect(isAlreadyExistsSmbError("NT_STATUS_ACCESS_DENIED")).toBe(false);
        expect(isAlreadyExistsSmbError("smbclient terminato con codice 1")).toBe(false);
    });
});

describe("restoreBackupFromUpload", () => {
    it("rifiuta le estensioni diverse da .sql e .tar.gz", async () => {
        await expect(restoreBackupFromUpload(Buffer.from("x"), "malware.exe", false)).rejects.toThrow(
            "Il file caricato deve avere estensione .sql o .tar.gz"
        );
    });

    it("rifiuta un archivio con estensione parziale", async () => {
        await expect(restoreBackupFromUpload(Buffer.from("x"), "backup.tar", false)).rejects.toThrow(
            BackupManagerError
        );
    });
});

const smbState: Partial<BackupSettingsState> = {
    smbEnabled: true,
    smbHost: "nas.locale",
    smbShare: "backup",
    smbPath: "laboratorio",
    smbDomain: "",
    smbPort: 445,
    smbUsername: "utente-nas",
    smbPasswordEncrypted: "cifrato:password-nas",
};

beforeEach(() => {
    state = { ...defaultState };
    vi.clearAllMocks();
    isEmailConfigured.mockResolvedValue(false);
    getCompanySettings.mockResolvedValue({ name: "Laboratorio", email: "lab@example.com" });
    createBackupArchive.mockResolvedValue(undefined);
    uploadDumpToSmb.mockResolvedValue(undefined);
    pruneOldSmbBackups.mockResolvedValue(undefined);
});

describe("updateBackupSettings", () => {
    const input = {
        autoEnabled: false,
        frequencyDays: 1,
        runAt: "02:00",
        maxBackupsToKeep: 7,
        notifyEmailOnFailure: false,
        smbEnabled: false,
        smbHost: "",
        smbShare: "",
        smbPath: "",
        smbDomain: "",
        smbPort: 445,
        smbUsername: "",
    };

    /** La cartella di destinazione non è configurabile dal client: è montata dal compose. */
    it("tiene la cartella montata dal compose, ripulisce i campi del NAS e salva", async () => {
        const result = await updateBackupSettings({
            ...input,
            smbEnabled: true,
            smbHost: "  nas.locale ",
            smbShare: " backup ",
            smbPath: " laboratorio ",
            smbUsername: " utente-nas ",
            smbPassword: "password-nas",
        });

        expect(persistState).toHaveBeenCalledOnce();
        expect(state).toMatchObject({
            outputDir: "backups",
            maxBackupsToKeep: 7,
            smbHost: "nas.locale",
            smbShare: "backup",
            smbPath: "laboratorio",
            smbUsername: "utente-nas",
            smbPasswordEncrypted: "cifrato:password-nas",
        });
        expect(result).not.toHaveProperty("smbPasswordEncrypted");
        expect(result.smbPasswordSet).toBe(true);
    });

    /** Il campo password arriva vuoto quando non la si vuole cambiare: la vecchia resta. */
    it("senza una nuova password tiene quella già salvata", async () => {
        state = { ...defaultState, ...smbState };

        await updateBackupSettings({ ...input, ...smbState, smbEnabled: true } as typeof input);

        expect(state.smbPasswordEncrypted).toBe("cifrato:password-nas");
    });

    it("rifiuta il NAS attivo senza host, condivisione o utente, senza salvare", async () => {
        await expect(
            updateBackupSettings({ ...input, smbEnabled: true, smbHost: "nas", smbShare: "  ", smbUsername: "u" })
        ).rejects.toMatchObject({ statusCode: 400 });

        expect(persistState).not.toHaveBeenCalled();
    });

    it("rifiuta il NAS attivo senza nessuna password", async () => {
        await expect(
            updateBackupSettings({ ...input, smbEnabled: true, smbHost: "nas", smbShare: "b", smbUsername: "u" })
        ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("password") as unknown });

        expect(persistState).not.toHaveBeenCalled();
    });

    it("rifiuta l'avviso email se l'invio email non è configurato", async () => {
        await expect(updateBackupSettings({ ...input, notifyEmailOnFailure: true })).rejects.toMatchObject({
            statusCode: 400,
        });

        expect(persistState).not.toHaveBeenCalled();
    });

    it("accetta l'avviso email quando l'invio è configurato", async () => {
        isEmailConfigured.mockResolvedValue(true);

        await updateBackupSettings({ ...input, notifyEmailOnFailure: true });

        expect(state.notifyEmailOnFailure).toBe(true);
    });

    it("con il backup automatico attivo fissa la prossima esecuzione nel futuro; spento la toglie", async () => {
        await updateBackupSettings({ ...input, autoEnabled: true });
        expect(new Date(state.nextRunAt!).getTime()).toBeGreaterThan(Date.now());

        await updateBackupSettings({ ...input, autoEnabled: false });
        expect(state.nextRunAt).toBeNull();
    });

    /**
     * D3: prima `updateBackupSettings` scriveva ogni campo direttamente sull'oggetto in cache
     * di `loadState` e validava solo dopo. Un salvataggio respinto con 400 lasciava comunque i
     * valori (mai passati da `persistState`, quindi mai scritti su disco) visibili in memoria:
     * lo scheduler del backup automatico li avrebbe letti al giro successivo.
     */
    it("un 400 non modifica lo stato in memoria: resta quello di prima, non quello rifiutato", async () => {
        const before = { ...state };

        await expect(
            updateBackupSettings({ ...input, smbEnabled: true, smbHost: "nas", smbShare: "  ", smbUsername: "u" })
        ).rejects.toMatchObject({ statusCode: 400 });

        expect(state).toEqual(before);
        expect(persistState).not.toHaveBeenCalled();
    });
});

describe("runBackupNow", () => {
    it("crea l'archivio nella cartella configurata, applica la retention e registra il successo", async () => {
        state = { ...defaultState, maxBackupsToKeep: 5 };

        const result = await runBackupNow("manual");

        const archivePath = createBackupArchive.mock.calls[0][0];
        expect(path.dirname(archivePath)).toBe(path.join(process.cwd(), "backups"));
        expect(path.basename(archivePath)).toMatch(/^db-backup-\d{8}-\d{6}\.tar\.gz$/);
        expect(pruneOldBackups).toHaveBeenCalledWith("backups", 5);
        expect(state).toMatchObject({
            lastRunStatus: "success",
            lastRunOrigin: "manual",
            lastError: null,
            lastDumpPath: archivePath,
        });
        expect(persistState).toHaveBeenCalled();
        expect(result.message).toBe("Dump completato con successo");
        expect(uploadDumpToSmb).not.toHaveBeenCalled();
    });

    it("non avvia un dump automatico se l'automatico è spento", async () => {
        await expect(runBackupNow("auto")).rejects.toMatchObject({ statusCode: 400 });

        expect(createBackupArchive).not.toHaveBeenCalled();
    });

    it("rifiuta con 409 un secondo dump mentre il primo è in corso, e libera il blocco alla fine", async () => {
        let finishFirst!: () => void;
        createBackupArchive.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    finishFirst = resolve;
                })
        );

        const first = runBackupNow("manual");
        await expect(runBackupNow("manual")).rejects.toMatchObject({ statusCode: 409 });

        finishFirst();
        await first;
        await expect(runBackupNow("manual")).resolves.toMatchObject({ lastRunStatus: "success" });
    });

    it("un dump manuale fallito registra l'errore, lo rilancia e libera il blocco, senza notifiche", async () => {
        createBackupArchive.mockRejectedValueOnce(new Error("pg_dump terminato con codice 1"));

        await expect(runBackupNow("manual")).rejects.toThrow("pg_dump terminato con codice 1");

        expect(state).toMatchObject({ lastRunStatus: "failed", lastError: "pg_dump terminato con codice 1" });
        expect(persistState).toHaveBeenCalled();
        expect(recordNotification).not.toHaveBeenCalled();
        await expect(runBackupNow("manual")).resolves.toBeDefined();
    });

    describe("fallimento del backup automatico", () => {
        beforeEach(() => {
            state = { ...defaultState, autoEnabled: true, notifyEmailOnFailure: true };
            createBackupArchive.mockRejectedValue(new Error("disco pieno"));
        });

        /** Gira di notte: senza notifica non lo vedrebbe nessuno. */
        it("lascia una notifica in app e manda la mail all'indirizzo dell'azienda", async () => {
            isEmailConfigured.mockResolvedValue(true);

            await expect(runBackupNow("auto")).rejects.toThrow("disco pieno");

            expect(recordNotification).toHaveBeenCalledWith(
                expect.objectContaining({ dedupeKey: "backup:auto-failed", message: "disco pieno" })
            );
            expect(sendEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: "lab@example.com",
                    subject: "Backup automatico non riuscito - Laboratorio",
                })
            );
        });

        it("senza avviso email attivo si ferma alla notifica in app", async () => {
            state.notifyEmailOnFailure = false;
            isEmailConfigured.mockResolvedValue(true);

            await expect(runBackupNow("auto")).rejects.toThrow("disco pieno");

            expect(recordNotification).toHaveBeenCalled();
            expect(sendEmail).not.toHaveBeenCalled();
        });

        it("senza un indirizzo dell'azienda non manda nessuna mail", async () => {
            isEmailConfigured.mockResolvedValue(true);
            getCompanySettings.mockResolvedValue({ name: "Laboratorio", email: "" });

            await expect(runBackupNow("auto")).rejects.toThrow("disco pieno");

            expect(sendEmail).not.toHaveBeenCalled();
        });

        /** L'invio della mail non deve mai sostituire l'errore del backup con il proprio. */
        it("una mail che non parte resta nei log e l'errore riportato è quello del backup", async () => {
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
            isEmailConfigured.mockResolvedValue(true);
            sendEmail.mockRejectedValueOnce(new Error("SMTP giù"));

            await expect(runBackupNow("auto")).rejects.toThrow("disco pieno");

            expect(consoleError).toHaveBeenCalledWith("Invio email di avviso backup non riuscito:", expect.any(Error));
            consoleError.mockRestore();
        });

        /**
         * D2: prima l'invio della mail di avviso era atteso dentro il try/catch che il
         * try/finally del lock avvolge, quindi un SMTP lento (o irraggiungibile, coi timeout di
         * emailManager.ts) teneva il lock del dump per tutta l'attesa. Ora l'invio parte senza
         * await: qui la mail resta appesa apposta (non viene mai risolta prima delle asserzioni)
         * eppure il lock si libera comunque, e un secondo dump può partire subito.
         */
        it("il lock si libera senza aspettare l'invio della mail di avviso", async () => {
            isEmailConfigured.mockResolvedValue(true);
            let resolveEmail!: () => void;
            sendEmail.mockImplementationOnce(
                () =>
                    new Promise<void>((resolve) => {
                        resolveEmail = resolve;
                    })
            );

            await expect(runBackupNow("auto")).rejects.toThrow("disco pieno");

            createBackupArchive.mockResolvedValueOnce(undefined);
            await expect(runBackupNow("manual")).resolves.toMatchObject({ lastRunStatus: "success" });

            resolveEmail();
        });
    });

    describe("copia sul NAS", () => {
        beforeEach(() => {
            state = { ...defaultState, ...smbState, maxBackupsToKeep: 4 };
        });

        it("carica l'archivio con la password decifrata e pulisce i vecchi con la stessa retention", async () => {
            const result = await runBackupNow("manual");

            const [config, uploadedPath] = uploadDumpToSmb.mock.calls[0] as [SmbConnectionConfig, string];
            expect(config).toMatchObject({ host: "nas.locale", share: "backup", password: "password-nas" });
            expect(uploadedPath).toBe(state.lastDumpPath);
            expect(pruneOldSmbBackups).toHaveBeenCalledWith(config, 4);
            expect(state).toMatchObject({ smbLastStatus: "success", smbLastError: null });
            expect(result.message).toBe("Dump completato con successo");
        });

        /** Il backup locale c'è: un NAS irraggiungibile non deve farlo sembrare fallito. */
        it("se la copia fallisce il backup locale resta riuscito e il messaggio lo dice", async () => {
            uploadDumpToSmb.mockRejectedValueOnce(new Error("NT_STATUS_LOGON_FAILURE"));

            const result = await runBackupNow("manual");

            expect(state).toMatchObject({
                lastRunStatus: "success",
                smbLastStatus: "failed",
                smbLastError: "NT_STATUS_LOGON_FAILURE",
            });
            expect(result.message).toContain("la copia su NAS non e riuscita: NT_STATUS_LOGON_FAILURE");
            expect(recordNotification).not.toHaveBeenCalled();
        });

        it("in automatico una copia fallita lascia una notifica", async () => {
            state.autoEnabled = true;
            uploadDumpToSmb.mockRejectedValueOnce(new Error("NT_STATUS_HOST_UNREACHABLE"));

            await runBackupNow("auto");

            expect(recordNotification).toHaveBeenCalledWith(
                expect.objectContaining({ dedupeKey: "backup:auto-nas-failed" })
            );
        });

        it("se fallisce solo la pulizia sul NAS la copia resta riuscita, e in automatico lo notifica", async () => {
            state.autoEnabled = true;
            pruneOldSmbBackups.mockRejectedValueOnce(new Error("NT_STATUS_ACCESS_DENIED"));

            const result = await runBackupNow("auto");

            expect(state.smbLastStatus).toBe("success");
            expect(result.message).toContain("la pulizia dei vecchi backup sul NAS non e riuscita");
            expect(recordNotification).toHaveBeenCalledWith(
                expect.objectContaining({ dedupeKey: "backup:auto-nas-prune-failed" })
            );
        });

        it("con il NAS attivo ma senza password non tenta la copia", async () => {
            state.smbPasswordEncrypted = null;

            await runBackupNow("manual");

            expect(uploadDumpToSmb).not.toHaveBeenCalled();
        });
    });
});

describe("scheduler del backup automatico", () => {
    const minute = 60 * 1000;

    beforeEach(() => {
        vi.useFakeTimers({ now: new Date("2026-09-14T10:00:00") });
    });

    afterEach(() => {
        stopBackupScheduler();
        vi.useRealTimers();
    });

    it("all'ora prevista esegue il dump una volta sola e fissa la prossima esecuzione", async () => {
        state = { ...defaultState, autoEnabled: true, runAt: "10:00", nextRunAt: new Date().toISOString() };

        startBackupScheduler();
        startBackupScheduler();
        await vi.advanceTimersByTimeAsync(minute);

        expect(createBackupArchive).toHaveBeenCalledOnce();
        expect(state.lastRunOrigin).toBe("auto");
        expect(new Date(state.nextRunAt!).getTime()).toBeGreaterThan(Date.now());

        await vi.advanceTimersByTimeAsync(5 * minute);
        expect(createBackupArchive).toHaveBeenCalledOnce();
    });

    it("prima dell'ora prevista aspetta", async () => {
        state = {
            ...defaultState,
            autoEnabled: true,
            nextRunAt: new Date(Date.now() + 10 * minute).toISOString(),
        };

        startBackupScheduler();
        await vi.advanceTimersByTimeAsync(9 * minute);
        expect(createBackupArchive).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(2 * minute);
        expect(createBackupArchive).toHaveBeenCalledOnce();
    });

    it("con l'automatico spento, o senza una data valida, non fa niente", async () => {
        state = { ...defaultState, autoEnabled: false, nextRunAt: new Date(0).toISOString() };
        startBackupScheduler();
        await vi.advanceTimersByTimeAsync(3 * minute);

        state = { ...defaultState, autoEnabled: true, nextRunAt: "non-una-data" };
        await vi.advanceTimersByTimeAsync(3 * minute);

        expect(createBackupArchive).not.toHaveBeenCalled();
    });

    it("salta il giro se un dump è già in corso", async () => {
        let finishManual!: () => void;
        createBackupArchive.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    finishManual = resolve;
                })
        );
        state = { ...defaultState, autoEnabled: true, nextRunAt: new Date(0).toISOString() };
        const manual = runBackupNow("manual");

        startBackupScheduler();
        await vi.advanceTimersByTimeAsync(minute);
        expect(createBackupArchive).toHaveBeenCalledOnce();

        finishManual();
        await manual;
    });

    it("un dump fallito finisce nei log e non ferma lo scheduler", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        state = { ...defaultState, autoEnabled: true, nextRunAt: new Date().toISOString() };
        createBackupArchive.mockRejectedValueOnce(new Error("pg_dump terminato con codice 1"));

        startBackupScheduler();
        await vi.advanceTimersByTimeAsync(minute);
        expect(consoleError).toHaveBeenCalledWith("Errore scheduler dump database:", expect.any(Error));

        // Anche fallito, il giro ha fissato la prossima esecuzione: rimettendola a ora riparte.
        state.nextRunAt = new Date().toISOString();
        await vi.advanceTimersByTimeAsync(minute);
        expect(createBackupArchive).toHaveBeenCalledTimes(2);
        consoleError.mockRestore();
    });
});
