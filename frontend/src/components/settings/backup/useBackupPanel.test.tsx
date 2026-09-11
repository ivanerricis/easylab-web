import { act, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

const api = vi.hoisted(() => ({
    getBackupSettings: vi.fn(),
    listBackupDumps: vi.fn(),
    updateBackupSettings: vi.fn(),
    runBackupNow: vi.fn(),
    testSmbConnection: vi.fn(),
    restoreBackupFromExisting: vi.fn(),
    restoreBackupFromUpload: vi.fn(),
    getBackupKey: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    const forwarded = Object.fromEntries(
        Object.keys(api).map((name) => [
            name,
            (...args: unknown[]) => (api[name as keyof typeof api] as (...a: unknown[]) => unknown)(...args),
        ])
    );
    return { ...errors, ...forwarded, getBackupDumpDownloadUrl: (name: string) => `/download/${name}` };
});

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

import { AuthProviderContext, initialAuthProviderState } from "@/components/auth-provider-context";
import { BusyGuardProvider } from "@/components/busy-guard-provider";
import { useBackupPanel } from "./useBackupPanel";

const logout = vi.fn();

const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
        <AuthProviderContext.Provider value={{ ...initialAuthProviderState, isLoading: false, logout }}>
            <BusyGuardProvider>{children}</BusyGuardProvider>
        </AuthProviderContext.Provider>
    </MemoryRouter>
);

const settings = {
    autoEnabled: true,
    frequencyDays: 1,
    runAt: "21:00",
    outputDir: "backups",
    maxBackupsToKeep: 14,
    nextRunAt: "2026-09-11T19:00:00.000Z",
    lastRunAt: null,
    lastRunStatus: "idle",
    lastRunOrigin: null,
    lastError: null,
    lastDumpPath: null,
    notifyEmailOnFailure: false,
    emailConfigured: false,
    smbEnabled: false,
    smbHost: "",
    smbShare: "",
    smbPath: "",
    smbDomain: "",
    smbPort: 445,
    smbUsername: "",
    smbPasswordSet: false,
    smbLastRunAt: null,
    smbLastStatus: "idle",
    smbLastError: null,
    lastRestoreAt: null,
    lastRestoreStatus: "idle",
    lastRestoreError: null,
    lastRestoreFileName: null,
    restoreSecretsToReconfigure: [],
};

const renderPanel = async () => {
    const hook = renderHook(() => useBackupPanel(), { wrapper });
    await waitFor(() => {
        expect(hook.result.current.isLoading).toBe(false);
        expect(hook.result.current.isLoadingDumps).toBe(false);
    });
    return hook;
};

type Panel = ReturnType<typeof useBackupPanel>;

const edit = (result: { current: Panel }, values: Partial<Panel["formValues"]>) => {
    act(() => {
        result.current.setFormValues((prev) => ({ ...prev, ...values }));
    });
};

const save = async (result: { current: Panel }) => {
    await act(async () => {
        await result.current.handleSave();
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    api.getBackupSettings.mockResolvedValue(settings);
    api.listBackupDumps.mockResolvedValue([
        { fileName: "db-backup-1.tar.gz", sizeBytes: 1000, createdAt: "2026-09-10T21:00:00.000Z" },
        { fileName: "db-backup-2.tar.gz", sizeBytes: 2500, createdAt: "2026-09-09T21:00:00.000Z" },
    ]);
    api.updateBackupSettings.mockImplementation(async (payload: object) => ({ ...settings, ...payload }));
});

describe("useBackupPanel: caricamento e modifiche", () => {
    it("carica impostazioni e dump, e somma la dimensione dei dump", async () => {
        const { result } = await renderPanel();

        expect(result.current.formValues.runAt).toBe("21:00");
        expect(result.current.dumpFiles).toHaveLength(2);
        expect(result.current.totalDumpsSize).toBe(3500);
        expect(result.current.isDirty).toBe(false);
    });

    it("segna il form come modificato, anche solo per una password scritta", async () => {
        const { result } = await renderPanel();

        edit(result, { smbPassword: "segreta" });

        expect(result.current.isDirty).toBe(true);
    });

    it("segnala il caricamento non riuscito", async () => {
        api.getBackupSettings.mockRejectedValue(new Error("Accesso negato"));

        await renderPanel();

        expect(toast.error).toHaveBeenCalledWith("Accesso negato");
    });
});

describe("useBackupPanel: salvataggio", () => {
    it.each([
        [{ frequencyDays: 0 }, "La frequenza deve essere un numero intero positivo"],
        [{ frequencyDays: 1.5 }, "La frequenza deve essere un numero intero positivo"],
        [{ runAt: "24:00" }, "L'orario deve essere nel formato HH:mm"],
        [{ runAt: "9:00" }, "L'orario deve essere nel formato HH:mm"],
        [{ outputDir: "   " }, "Specifica una cartella di destinazione per il dump"],
        [{ maxBackupsToKeep: 0 }, "Il numero di backup da mantenere deve essere un numero intero positivo"],
        [{ notifyEmailOnFailure: true }, "Configura prima l'invio email nelle impostazioni per attivare questo avviso"],
        [{ smbEnabled: true, smbHost: "nas" }, "Per il NAS specifica almeno host, condivisione e utente"],
        [
            { smbEnabled: true, smbHost: "nas", smbShare: "backup", smbUsername: "admin" },
            "Specifica una password per la connessione al NAS",
        ],
        [
            {
                smbEnabled: true,
                smbHost: "nas",
                smbShare: "backup",
                smbUsername: "admin",
                smbPassword: "x",
                smbPort: 70000,
            },
            "La porta SMB deve essere un numero valido",
        ],
    ])("rifiuta %j", async (values, message) => {
        const { result } = await renderPanel();

        edit(result, values);
        await save(result);

        expect(toast.error).toHaveBeenCalledWith(message);
        expect(api.updateBackupSettings).not.toHaveBeenCalled();
    });

    /** La password del NAS non torna mai dal server: se è già salvata, non va richiesta di nuovo. */
    it("non chiede di nuovo la password del NAS se è già salvata", async () => {
        api.getBackupSettings.mockResolvedValue({
            ...settings,
            smbEnabled: true,
            smbHost: "nas",
            smbShare: "backup",
            smbUsername: "admin",
            smbPasswordSet: true,
        });
        const { result } = await renderPanel();

        edit(result, { maxBackupsToKeep: 30 });
        await save(result);

        expect(api.updateBackupSettings).toHaveBeenCalledWith(
            expect.objectContaining({ smbPassword: "", maxBackupsToKeep: 30 })
        );
    });

    it("salva i campi ripuliti e dimentica la password scritta", async () => {
        const { result } = await renderPanel();

        edit(result, {
            outputDir: " backups/lab ",
            smbEnabled: true,
            smbHost: " nas.local ",
            smbShare: " backup ",
            smbUsername: " admin ",
            smbPassword: "segreta",
        });
        await save(result);

        expect(api.updateBackupSettings).toHaveBeenCalledWith(
            expect.objectContaining({
                outputDir: "backups/lab",
                smbHost: "nas.local",
                smbShare: "backup",
                smbUsername: "admin",
                smbPassword: "segreta",
            })
        );
        expect(toast.success).toHaveBeenCalledWith("Impostazioni backup salvate");
        expect(result.current.formValues.smbPassword).toBe("");
        // Salvato, il form torna pulito.
        expect(result.current.isDirty).toBe(false);
    });
});

describe("useBackupPanel: NAS e backup manuale", () => {
    it("per il test di connessione pretende la password scritta", async () => {
        const { result } = await renderPanel();

        edit(result, { smbHost: "nas", smbShare: "backup", smbUsername: "admin" });
        await act(async () => {
            await result.current.handleTestSmbConnection();
        });
        expect(toast.error).toHaveBeenCalledWith(
            "Inserisci la password nel campo qui sopra per testare la connessione"
        );

        api.testSmbConnection.mockResolvedValue({ message: "Connessione riuscita" });
        edit(result, { smbPassword: " segreta " });
        await act(async () => {
            await result.current.handleTestSmbConnection();
        });

        expect(api.testSmbConnection).toHaveBeenCalledWith({
            host: "nas",
            share: "backup",
            path: "",
            domain: "",
            port: 445,
            username: "admin",
            password: "segreta",
        });
        expect(toast.success).toHaveBeenCalledWith("Connessione riuscita");
    });

    it("durante il backup blocca la pagina, poi la sblocca e ricarica i dump", async () => {
        let finishBackup!: (value: unknown) => void;
        api.runBackupNow.mockReturnValue(new Promise((resolve) => (finishBackup = resolve)));
        const { result } = await renderPanel();

        let running!: Promise<void>;
        act(() => {
            running = result.current.handleRunBackup();
        });

        expect(await screen.findByRole("alert")).toHaveTextContent("Backup in corso...");

        await act(async () => {
            finishBackup({ ...settings, lastRunStatus: "success", message: "Backup completato" });
            await running;
        });

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(toast.success).toHaveBeenCalledWith("Backup completato");
        expect(result.current.lastRunStatus).toBe("success");
        await waitFor(() => {
            expect(api.listBackupDumps).toHaveBeenCalledTimes(2);
        });
    });

    /** Il dump locale è riuscito ma la copia sul NAS no: è un avviso, non un successo pieno. */
    it("avvisa quando la copia sul NAS non riesce", async () => {
        api.runBackupNow.mockResolvedValue({
            ...settings,
            smbEnabled: true,
            smbLastStatus: "failed",
            message: "Dump creato, copia sul NAS non riuscita",
        });
        const { result } = await renderPanel();

        await act(async () => {
            await result.current.handleRunBackup();
        });

        expect(toast.warning).toHaveBeenCalledWith("Dump creato, copia sul NAS non riuscita", { richColors: true });
        expect(toast.success).not.toHaveBeenCalled();
    });

    it("scarica un dump dal suo indirizzo", async () => {
        const assign = vi.fn();
        Object.defineProperty(window, "location", { value: { ...window.location, assign }, configurable: true });
        const { result } = await renderPanel();

        result.current.handleDownloadDump("db-backup-1.tar.gz");

        expect(assign).toHaveBeenCalledWith("/download/db-backup-1.tar.gz");
    });
});

describe("useBackupPanel: ripristino", () => {
    const restoreResult = { ...settings, lastRestoreStatus: "success", message: "Ripristino completato" };

    /**
     * Dopo il ripristino la sessione in uso non corrisponde più al database: si torna al login
     * senza "provenienza", così dopo l'accesso non si atterra di nuovo qui.
     */
    it("ripristina da un dump esistente e costringe a un nuovo accesso", async () => {
        api.restoreBackupFromExisting.mockResolvedValue(restoreResult);
        logout.mockResolvedValue(undefined);
        const { result } = await renderPanel();

        act(() => {
            result.current.setResetSchemaOnRestore(true);
            result.current.openRestoreConfirm({ type: "existing", fileName: "db-backup-1.tar.gz" });
        });
        await act(async () => {
            await result.current.handleConfirmRestore();
        });

        expect(api.restoreBackupFromExisting).toHaveBeenCalledWith("db-backup-1.tar.gz", true);
        expect(toast.success).toHaveBeenCalledWith("Ripristino completato");
        expect(navigate).toHaveBeenCalledWith("/login", { replace: true });
        expect(logout).toHaveBeenCalled();
        expect(result.current.pendingRestore).toBeNull();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    /** La chiave di backup incollata (ripristino su un server diverso) va passata solo se compilata. */
    it("passa la chiave di backup incollata solo quando è stata scritta", async () => {
        api.restoreBackupFromExisting.mockResolvedValue(restoreResult);
        logout.mockResolvedValue(undefined);
        const { result } = await renderPanel();

        act(() => {
            result.current.openRestoreConfirm({ type: "existing", fileName: "db-backup-1.tar.gz" });
            result.current.setRestoreBackupKeyInput(`  ${"ab".repeat(32)}  `);
        });
        await act(async () => {
            await result.current.handleConfirmRestore();
        });

        expect(api.restoreBackupFromExisting).toHaveBeenCalledWith(
            "db-backup-1.tar.gz",
            false,
            "ab".repeat(32)
        );
    });

    it("dimentica la chiave di backup incollata quando si riapre la conferma", async () => {
        const { result } = await renderPanel();

        act(() => {
            result.current.openRestoreConfirm({ type: "existing", fileName: "db-backup-1.tar.gz" });
            result.current.setRestoreBackupKeyInput("ab".repeat(32));
        });
        act(() => {
            result.current.closeRestoreConfirm();
        });
        act(() => {
            result.current.openRestoreConfirm({ type: "existing", fileName: "db-backup-2.tar.gz" });
        });

        expect(result.current.restoreBackupKeyInput).toBe("");
    });

    it("ripristina da un file caricato, anche se il logout fallisce", async () => {
        api.restoreBackupFromUpload.mockResolvedValue(restoreResult);
        logout.mockRejectedValue(new Error("sessione già inesistente"));
        const file = new File(["dump"], "backup.tar.gz");
        const { result } = await renderPanel();

        act(() => {
            result.current.openRestoreConfirm({ type: "upload", file });
        });
        await act(async () => {
            await result.current.handleConfirmRestore();
        });

        expect(api.restoreBackupFromUpload).toHaveBeenCalledWith(file, false);
        expect(navigate).toHaveBeenCalledWith("/login", { replace: true });
    });

    it("avvisa dei segreti da reinserire dopo il ripristino", async () => {
        api.restoreBackupFromExisting.mockResolvedValue({
            ...restoreResult,
            restoreSecretsToReconfigure: ["Password SMTP"],
            message: "Ripristino completato: reinserisci la password SMTP",
        });
        logout.mockResolvedValue(undefined);
        const { result } = await renderPanel();

        act(() => {
            result.current.openRestoreConfirm({ type: "existing", fileName: "db-backup-1.tar.gz" });
        });
        await act(async () => {
            await result.current.handleConfirmRestore();
        });

        expect(toast.warning).toHaveBeenCalledWith("Ripristino completato: reinserisci la password SMTP", {
            richColors: true,
        });
        expect(result.current.secretsToReconfigure).toEqual(["Password SMTP"]);
    });

    it("se il ripristino fallisce resta nella pagina e la sblocca", async () => {
        api.restoreBackupFromExisting.mockRejectedValue(new Error("Archivio non valido"));
        const { result } = await renderPanel();

        act(() => {
            result.current.openRestoreConfirm({ type: "existing", fileName: "db-backup-1.tar.gz" });
        });
        await act(async () => {
            await result.current.handleConfirmRestore();
        });

        expect(toast.error).toHaveBeenCalledWith("Archivio non valido");
        expect(navigate).not.toHaveBeenCalled();
        expect(logout).not.toHaveBeenCalled();
        expect(result.current.isRestoring).toBe(false);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("non si lascia chiudere la conferma a ripristino in corso", async () => {
        let finishRestore!: (value: unknown) => void;
        api.restoreBackupFromExisting.mockReturnValue(new Promise((resolve) => (finishRestore = resolve)));
        logout.mockResolvedValue(undefined);
        const { result } = await renderPanel();

        act(() => {
            result.current.openRestoreConfirm({ type: "existing", fileName: "db-backup-1.tar.gz" });
        });
        let restoring!: Promise<void>;
        act(() => {
            restoring = result.current.handleConfirmRestore();
        });
        act(() => {
            result.current.closeRestoreConfirm();
        });

        expect(result.current.pendingRestore).not.toBeNull();

        await act(async () => {
            finishRestore(restoreResult);
            await restoring;
        });
    });
});

describe("useBackupPanel: chiave di backup", () => {
    it("non la carica finché non viene richiesta esplicitamente", async () => {
        const { result } = await renderPanel();

        expect(result.current.backupKey).toBeNull();
        expect(api.getBackupKey).not.toHaveBeenCalled();
    });

    it("la mostra dopo averla richiesta, e non la richiede una seconda volta", async () => {
        api.getBackupKey.mockResolvedValue({ key: "ab".repeat(32) });
        const { result } = await renderPanel();

        await act(async () => {
            await result.current.handleRevealBackupKey();
        });

        expect(result.current.backupKey).toBe("ab".repeat(32));

        await act(async () => {
            await result.current.handleRevealBackupKey();
        });

        expect(api.getBackupKey).toHaveBeenCalledTimes(1);
    });

    it("segnala l'errore se il recupero della chiave fallisce", async () => {
        api.getBackupKey.mockRejectedValue(new Error("Accesso negato"));
        const { result } = await renderPanel();

        await act(async () => {
            await result.current.handleRevealBackupKey();
        });

        expect(toast.error).toHaveBeenCalledWith("Accesso negato");
        expect(result.current.backupKey).toBeNull();
    });
});
