import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupSettingsState } from "./backupState";

const fsPromisesMock = vi.hoisted(() => ({
    mkdir: vi.fn(),
    access: vi.fn(),
    rm: vi.fn(),
    cp: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
}));

vi.mock("node:fs", () => ({
    default: { promises: fsPromisesMock },
}));

const backupFilesMock = vi.hoisted(() => ({
    archiveDataEntry: "data",
    archiveDumpEntry: "dump.sql",
    backedUpDataEntries: ["email-settings.json", "backup-settings.json", "company-settings.json", "logo"],
    getBackupDumpPath: vi.fn(),
    isArchiveFileName: vi.fn(),
    settingsDir: "/fake/data",
}));

vi.mock("./backupFiles", () => backupFilesMock);

const backupLockMock = vi.hoisted(() => ({
    assertNoOperationInProgress: vi.fn(),
    beginRestore: vi.fn(),
    endRestore: vi.fn(),
}));

vi.mock("./backupLock", () => backupLockMock);

const backupProcessMock = vi.hoisted(() => ({
    resetPublicSchema: vi.fn(),
    runPsql: vi.fn(),
    runTar: vi.fn(),
}));

vi.mock("./backupProcess", () => backupProcessMock);

const backupStateMock = vi.hoisted(() => ({
    findSecretsToReconfigure: vi.fn(),
    invalidateBackupStateCache: vi.fn(),
    loadState: vi.fn(),
    persistState: vi.fn(),
    toPublicState: vi.fn(),
}));

vi.mock("./backupState", () => backupStateMock);

const companyManagerMock = vi.hoisted(() => ({ invalidateCompanySettingsCache: vi.fn() }));
vi.mock("./companyManager", () => companyManagerMock);

const emailManagerMock = vi.hoisted(() => ({ invalidateEmailSettingsCache: vi.fn() }));
vi.mock("./emailManager", () => emailManagerMock);

import { BackupManagerError } from "./backupError";
import { restoreBackupFromExisting, restoreBackupFromUpload } from "./backupRestore";

const makeState = (overrides: Partial<BackupSettingsState> = {}): BackupSettingsState => ({
    autoEnabled: false,
    frequencyDays: 1,
    runAt: "02:00",
    outputDir: "backups",
    maxBackupsToKeep: 14,
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: "idle",
    lastRunOrigin: null,
    lastError: null,
    lastDumpPath: null,
    notifyEmailOnFailure: false,
    smbEnabled: false,
    smbHost: "",
    smbShare: "",
    smbPath: "",
    smbDomain: "",
    smbPort: 445,
    smbUsername: "",
    smbPasswordEncrypted: null,
    smbLastRunAt: null,
    smbLastStatus: "idle",
    smbLastError: null,
    lastRestoreAt: null,
    lastRestoreStatus: "idle",
    lastRestoreError: null,
    lastRestoreFileName: null,
    ...overrides,
});

beforeEach(() => {
    // resetAllMocks (non solo clear): diversi test qui sotto mettono in coda un
    // mockReturnValueOnce/mockResolvedValueOnce che, per via di un lock o di un controllo
    // precedente, a volte non viene mai consumato. clearAllMocks lascerebbe quel valore in
    // coda per il test successivo, facendolo fallire in modo non ovvio.
    vi.resetAllMocks();
    backupStateMock.loadState.mockResolvedValue(makeState());
    backupStateMock.persistState.mockResolvedValue(undefined);
    backupStateMock.toPublicState.mockImplementation(async (state: BackupSettingsState) => ({
        ...state,
        smbPasswordSet: Boolean(state.smbPasswordEncrypted),
        restoreSecretsToReconfigure: [],
        emailConfigured: false,
    }));
    backupStateMock.findSecretsToReconfigure.mockResolvedValue([]);
    fsPromisesMock.mkdir.mockResolvedValue(undefined);
    fsPromisesMock.rm.mockResolvedValue(undefined);
    fsPromisesMock.cp.mockResolvedValue(undefined);
    fsPromisesMock.writeFile.mockResolvedValue(undefined);
    fsPromisesMock.unlink.mockResolvedValue(undefined);
});

describe("restoreBackupFromExisting", () => {
    it("propaga l'errore di getBackupDumpPath senza acquisire il lock", async () => {
        backupFilesMock.getBackupDumpPath.mockRejectedValueOnce(new BackupManagerError("File di dump non trovato", 404));

        await expect(restoreBackupFromExisting("db-dump-20260101-000000.sql", false)).rejects.toThrow(
            "File di dump non trovato"
        );
        expect(backupLockMock.assertNoOperationInProgress).not.toHaveBeenCalled();
        expect(backupLockMock.beginRestore).not.toHaveBeenCalled();
    });

    it("rifiuta se un'altra operazione e' gia' in corso, senza toccare il database", async () => {
        backupFilesMock.getBackupDumpPath.mockResolvedValueOnce("/backups/db-dump-20260701-020000.sql");
        backupLockMock.assertNoOperationInProgress.mockImplementationOnce(() => {
            throw new BackupManagerError("E gia in corso un'operazione sul database", 409);
        });

        await expect(restoreBackupFromExisting("db-dump-20260701-020000.sql", false)).rejects.toThrow(
            BackupManagerError
        );
        expect(backupLockMock.beginRestore).not.toHaveBeenCalled();
        expect(backupProcessMock.runPsql).not.toHaveBeenCalled();
        expect(backupStateMock.persistState).not.toHaveBeenCalled();
    });

    it("ripristina un dump .sql storico senza toccare le impostazioni (nessun archivio da estrarre)", async () => {
        backupFilesMock.getBackupDumpPath.mockResolvedValueOnce("/backups/db-dump-20260701-020000.sql");
        backupFilesMock.isArchiveFileName.mockReturnValueOnce(false);
        backupProcessMock.runPsql.mockResolvedValueOnce(undefined);

        const result = await restoreBackupFromExisting("db-dump-20260701-020000.sql", false);

        expect(backupLockMock.beginRestore).toHaveBeenCalledTimes(1);
        expect(backupProcessMock.resetPublicSchema).not.toHaveBeenCalled();
        expect(backupProcessMock.runPsql).toHaveBeenCalledWith(["-f", "/backups/db-dump-20260701-020000.sql"]);

        // Formato storico: niente cartella dati, quindi nessuna delle operazioni di
        // restoreDataEntries deve scattare.
        expect(fsPromisesMock.access).not.toHaveBeenCalled();
        expect(fsPromisesMock.cp).not.toHaveBeenCalled();
        expect(backupStateMock.invalidateBackupStateCache).not.toHaveBeenCalled();

        expect(backupStateMock.persistState).toHaveBeenCalledWith(
            expect.objectContaining({
                lastRestoreStatus: "success",
                lastRestoreError: null,
                lastRestoreFileName: "db-dump-20260701-020000.sql",
            })
        );
        expect(backupLockMock.endRestore).toHaveBeenCalledTimes(1);
        expect(result.message).toBe("Ripristino completato con successo");
    });

    it("con resetSchema=true azzera lo schema pubblico prima di eseguire il dump", async () => {
        backupFilesMock.getBackupDumpPath.mockResolvedValueOnce("/backups/db-dump-20260701-020000.sql");
        backupFilesMock.isArchiveFileName.mockReturnValueOnce(false);
        backupProcessMock.resetPublicSchema.mockResolvedValueOnce(undefined);
        backupProcessMock.runPsql.mockResolvedValueOnce(undefined);

        await restoreBackupFromExisting("db-dump-20260701-020000.sql", true);

        expect(backupProcessMock.resetPublicSchema).toHaveBeenCalledTimes(1);
        const resetOrder = backupProcessMock.resetPublicSchema.mock.invocationCallOrder[0];
        const psqlOrder = backupProcessMock.runPsql.mock.invocationCallOrder[0];
        expect(resetOrder).toBeLessThan(psqlOrder);
    });

    it("ripristina un archivio: riporta le impostazioni, invalida le cache e segnala i segreti da reinserire", async () => {
        backupFilesMock.getBackupDumpPath.mockResolvedValueOnce("/backups/db-backup-20260729-113813.tar.gz");
        backupFilesMock.isArchiveFileName.mockReturnValueOnce(true);
        backupProcessMock.runTar.mockResolvedValueOnce(undefined);
        backupProcessMock.runPsql.mockResolvedValueOnce(undefined);

        // 1a access: dump.sql nell'archivio estratto. Le 4 successive: le voci dati, di cui
        // solo le prime due presenti nell'archivio.
        fsPromisesMock.access
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("ENOENT"))
            .mockRejectedValueOnce(new Error("ENOENT"));

        const stateAfterRestore = makeState({ smbPasswordEncrypted: "iv:tag:data" });
        backupStateMock.loadState.mockResolvedValueOnce(makeState()).mockResolvedValueOnce(stateAfterRestore);
        backupStateMock.findSecretsToReconfigure.mockResolvedValueOnce(["Password NAS (SMB)"]);

        const result = await restoreBackupFromExisting("db-backup-20260729-113813.tar.gz", false);

        expect(backupProcessMock.runTar).toHaveBeenCalledWith([
            "-xzf",
            "/backups/db-backup-20260729-113813.tar.gz",
            "-C",
            expect.any(String),
        ]);

        // Ricarica lo stato dopo aver sovrascritto backup-settings.json dall'archivio.
        expect(backupStateMock.loadState).toHaveBeenCalledTimes(2);
        expect(backupStateMock.invalidateBackupStateCache).toHaveBeenCalledTimes(1);
        expect(emailManagerMock.invalidateEmailSettingsCache).toHaveBeenCalledTimes(1);
        expect(companyManagerMock.invalidateCompanySettingsCache).toHaveBeenCalledTimes(1);

        // Solo le due voci effettivamente presenti vengono copiate.
        expect(fsPromisesMock.cp).toHaveBeenCalledTimes(2);

        // La cartella temporanea di estrazione va ripulita alla fine.
        expect(fsPromisesMock.rm).toHaveBeenCalledWith(
            expect.stringContaining("tmp-extract-"),
            expect.objectContaining({ recursive: true, force: true })
        );

        expect(result.message).toContain("Reinserisci a mano: Password NAS (SMB).");
    });

    // `prepareRestoreSource` viene chiamato *dentro* il blocco try/finally di performRestore
    // (prima era fuori: un archivio invalido faceva sì che endRestore() non venisse mai
    // eseguito, e il lock del ripristino restava acquisito indefinitamente). Questo test
    // fissa che il lock si rilascia anche su questo fallimento.
    it("un archivio senza dump.sql viene rifiutato prima di toccare il database, e il lock si rilascia comunque", async () => {
        backupFilesMock.getBackupDumpPath.mockResolvedValueOnce("/backups/db-backup-corrotto.tar.gz");
        backupFilesMock.isArchiveFileName.mockReturnValueOnce(true);
        backupProcessMock.runTar.mockResolvedValueOnce(undefined);
        fsPromisesMock.access.mockRejectedValueOnce(new Error("ENOENT"));

        try {
            await restoreBackupFromExisting("db-backup-corrotto.tar.gz", false);
            expect.unreachable("doveva lanciare");
        } catch (error) {
            expect(error).toBeInstanceOf(BackupManagerError);
            expect((error as BackupManagerError).statusCode).toBe(400);
            expect((error as Error).message).toContain("manca dump.sql");
        }

        expect(backupProcessMock.runPsql).not.toHaveBeenCalled();
        expect(backupStateMock.persistState).toHaveBeenCalledWith(
            expect.objectContaining({
                lastRestoreStatus: "failed",
                lastRestoreError: expect.stringContaining("manca dump.sql") as string,
                lastRestoreFileName: "db-backup-corrotto.tar.gz",
            })
        );
        expect(backupLockMock.beginRestore).toHaveBeenCalledTimes(1);
        expect(backupLockMock.endRestore).toHaveBeenCalledTimes(1);
        // Anche in questo caso la cartella temporanea di estrazione viene ripulita.
        expect(fsPromisesMock.rm).toHaveBeenCalledWith(
            expect.stringContaining("tmp-extract-"),
            expect.objectContaining({ recursive: true, force: true })
        );
    });

    it("un fallimento durante il ripristino (dentro il try) rilascia comunque il lock e registra l'errore", async () => {
        backupFilesMock.getBackupDumpPath.mockResolvedValueOnce("/backups/db-dump-20260701-020000.sql");
        backupFilesMock.isArchiveFileName.mockReturnValueOnce(false);
        backupProcessMock.runPsql.mockRejectedValueOnce(new Error("colonna mancante"));

        await expect(restoreBackupFromExisting("db-dump-20260701-020000.sql", false)).rejects.toThrow(
            "colonna mancante"
        );

        expect(backupStateMock.persistState).toHaveBeenCalledWith(
            expect.objectContaining({
                lastRestoreStatus: "failed",
                lastRestoreError: "colonna mancante",
                lastRestoreFileName: "db-dump-20260701-020000.sql",
            })
        );
        expect(backupLockMock.endRestore).toHaveBeenCalledTimes(1);
    });
});

describe("restoreBackupFromUpload", () => {
    it("scrive il file caricato con il suffisso .sql e lo elimina sempre alla fine", async () => {
        backupFilesMock.isArchiveFileName.mockReturnValueOnce(false);
        backupProcessMock.runPsql.mockResolvedValueOnce(undefined);

        await restoreBackupFromUpload(Buffer.from("dump sql"), "vecchio-dump.sql", false);

        expect(fsPromisesMock.writeFile).toHaveBeenCalledWith(expect.stringMatching(/upload-\d+\.sql$/), expect.any(Buffer));
        expect(fsPromisesMock.unlink).toHaveBeenCalledWith(expect.stringMatching(/upload-\d+\.sql$/));
    });

    it("scrive il file caricato con il suffisso .tar.gz per un archivio", async () => {
        backupFilesMock.isArchiveFileName.mockReturnValue(true);
        backupProcessMock.runTar.mockResolvedValueOnce(undefined);
        backupProcessMock.runPsql.mockResolvedValueOnce(undefined);
        fsPromisesMock.access.mockResolvedValueOnce(undefined).mockRejectedValue(new Error("ENOENT"));

        await restoreBackupFromUpload(Buffer.from("archivio"), "caricato.tar.gz", false);

        expect(fsPromisesMock.writeFile).toHaveBeenCalledWith(
            expect.stringMatching(/upload-\d+\.tar\.gz$/),
            expect.any(Buffer)
        );
        expect(fsPromisesMock.unlink).toHaveBeenCalledWith(expect.stringMatching(/upload-\d+\.tar\.gz$/));
    });

    it("elimina il file temporaneo anche se il ripristino fallisce", async () => {
        backupFilesMock.isArchiveFileName.mockReturnValueOnce(false);
        backupProcessMock.runPsql.mockRejectedValueOnce(new Error("database non raggiungibile"));

        await expect(restoreBackupFromUpload(Buffer.from("x"), "upload.sql", false)).rejects.toThrow(
            "database non raggiungibile"
        );

        expect(fsPromisesMock.unlink).toHaveBeenCalledWith(expect.stringMatching(/upload-\d+\.sql$/));
    });
});
