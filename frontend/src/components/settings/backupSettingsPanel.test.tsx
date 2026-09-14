import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

const api = vi.hoisted(() => ({
    getBackupSettings: vi.fn(),
    listBackupDumps: vi.fn(),
    restoreBackupFromExisting: vi.fn(),
    restoreBackupFromUpload: vi.fn(),
    updateBackupSettings: vi.fn(),
    runBackupNow: vi.fn(),
    testSmbConnection: vi.fn(),
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

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

/**
 * Il ripristino si sblocca solo dopo aver scritto RESTORE lettera per lettera: da solo il test
 * sta sotto i 5 secondi di default, ma con la suite intera o la coverage accesa li ha superati.
 * Come negli altri file con moduli lunghi, meglio un test lento di uno che scade e continua a
 * battere tasti nel DOM del test successivo.
 */
vi.setConfig({ testTimeout: 20000 });

import { AuthProviderContext, initialAuthProviderState } from "@/components/auth-provider-context";
import BackupSettingsPanel from "./backupSettingsPanel";
import { renderWithProviders } from "@/test/render";

const logout = vi.fn();

const settings = {
    autoEnabled: true,
    frequencyDays: 1,
    runAt: "21:00",
    outputDir: "backups",
    maxBackupsToKeep: 14,
    nextRunAt: null,
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
    restoreSecretsToReconfigure: ["Password SMTP"],
};

const renderPanel = async () => {
    renderWithProviders(
        <AuthProviderContext.Provider value={{ ...initialAuthProviderState, isLoading: false, logout }}>
            <BackupSettingsPanel />
        </AuthProviderContext.Provider>
    );
    await screen.findByRole("button", { name: "Ripristina db-backup-1.tar.gz" });
};

beforeEach(() => {
    vi.clearAllMocks();
    api.getBackupSettings.mockResolvedValue(settings);
    api.listBackupDumps.mockResolvedValue([
        { fileName: "db-backup-1.tar.gz", sizeBytes: 2048, createdAt: "2026-09-10T21:00:00.000Z" },
    ]);
    api.restoreBackupFromExisting.mockResolvedValue({ ...settings, restoreSecretsToReconfigure: [], message: "Ok" });
    api.restoreBackupFromUpload.mockResolvedValue({ ...settings, restoreSecretsToReconfigure: [], message: "Ok" });
    logout.mockResolvedValue(undefined);
});

describe("BackupSettingsPanel", () => {
    it("elenca i dump con la loro dimensione", async () => {
        await renderPanel();

        const row = screen.getByText("db-backup-1.tar.gz").closest("tr") as HTMLElement;
        expect(within(row).getByText("2.0 KB")).toBeInTheDocument();
    });

    it("mostra quali password vanno reinserite dopo un ripristino", async () => {
        await renderPanel();

        expect(screen.getByText("Password da reinserire dopo il ripristino")).toBeInTheDocument();
        expect(screen.getByRole("listitem")).toHaveTextContent("Password SMTP");
    });

    /** Sovrascrivere il database è irreversibile: il pulsante si sblocca solo con la parola esatta. */
    it("ripristina un dump solo dopo aver scritto RESTORE", async () => {
        await renderPanel();

        await userEvent.click(screen.getByRole("button", { name: "Ripristina db-backup-1.tar.gz" }));
        const dialog = screen.getByRole("dialog", { name: "Conferma ripristino database" });
        expect(dialog).toHaveAccessibleDescription(expect.stringContaining('"db-backup-1.tar.gz"'));

        const confirm = within(dialog).getByRole("button", { name: "Ripristina" });
        await userEvent.type(within(dialog).getByLabelText(/per confermare/), "restore");
        expect(confirm).toBeDisabled();

        await userEvent.clear(within(dialog).getByLabelText(/per confermare/));
        await userEvent.type(within(dialog).getByLabelText(/per confermare/), "RESTORE");
        await userEvent.click(within(dialog).getByLabelText(/Svuota lo schema/));
        await userEvent.click(confirm);

        await waitFor(() => {
            expect(api.restoreBackupFromExisting).toHaveBeenCalledWith("db-backup-1.tar.gz", true);
        });
        expect(navigate).toHaveBeenCalledWith("/login", { replace: true });
    });

    it("ripristina da un file caricato", async () => {
        await renderPanel();
        const restoreFromFile = screen.getByRole("button", { name: "Ripristina da questo file" });
        expect(restoreFromFile).toBeDisabled();

        const file = new File(["dump"], "archivio.tar.gz", { type: "application/gzip" });
        await userEvent.upload(screen.getByLabelText("File .tar.gz o .sql"), file);

        expect(screen.getByText(/File selezionato: archivio\.tar\.gz/)).toBeInTheDocument();
        await userEvent.click(restoreFromFile);

        const dialog = screen.getByRole("dialog", { name: "Conferma ripristino database" });
        expect(dialog).toHaveAccessibleDescription(expect.stringContaining('"archivio.tar.gz"'));
        await userEvent.type(within(dialog).getByLabelText(/per confermare/), "RESTORE");
        await userEvent.click(within(dialog).getByRole("button", { name: "Ripristina" }));

        await waitFor(() => {
            expect(api.restoreBackupFromUpload).toHaveBeenCalledWith(file, false);
        });
    });

    it("annullando la conferma non ripristina nulla", async () => {
        await renderPanel();

        await userEvent.click(screen.getByRole("button", { name: "Ripristina db-backup-1.tar.gz" }));
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annulla" }));

        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
        expect(api.restoreBackupFromExisting).not.toHaveBeenCalled();
    });
});

/**
 * La logica di salvataggio e di prova sta in `useBackupPanel` e ha i suoi test; qui si
 * verifica il collegamento dei campi, cioè che ognuno scriva l'impostazione giusta. Un
 * `onChange` copiato dal campo accanto e non corretto passerebbe tutti gli altri test.
 */
describe("BackupSettingsPanel: campi della pianificazione e del NAS", () => {
    const change = (label: string | RegExp, value: string) =>
        fireEvent.change(screen.getByLabelText(label), { target: { value } });

    const fillNasFields = async () => {
        await userEvent.click(screen.getByLabelText("Copia ogni backup su una condivisione SMB/CIFS"));
        change("Host / IP del NAS", " nas.locale ");
        change("Nome condivisione", "backup");
        change("Sottocartella (opzionale)", "laboratorio");
        change("Porta", "1445");
        change("Dominio/Workgroup (opzionale)", "UFFICIO");
        change("Utente", "utente-nas");
        change("Password", "segreta");
    };

    it("i campi del NAS restano disattivati finché la copia non viene attivata", async () => {
        await renderPanel();

        expect(screen.getByLabelText("Host / IP del NAS")).toBeDisabled();
        expect(screen.getByRole("button", { name: "Testa connessione" })).toBeDisabled();

        await userEvent.click(screen.getByLabelText("Copia ogni backup su una condivisione SMB/CIFS"));

        expect(screen.getByLabelText("Host / IP del NAS")).toBeEnabled();
        expect(screen.getByRole("button", { name: "Testa connessione" })).toBeEnabled();
    });

    it("ogni campo arriva al salvataggio con il proprio valore", async () => {
        api.updateBackupSettings.mockResolvedValue({ ...settings, restoreSecretsToReconfigure: [] });
        await renderPanel();

        await userEvent.click(screen.getByLabelText("Esegui dump in automatico"));
        change("Ogni quanti giorni", "3");
        change("Orario", "03:30");
        change("Numero di backup da mantenere", "7");
        await fillNasFields();
        await userEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));

        await waitFor(() => {
            expect(api.updateBackupSettings).toHaveBeenCalledWith(
                expect.objectContaining({
                    autoEnabled: false,
                    frequencyDays: 3,
                    runAt: "03:30",
                    maxBackupsToKeep: 7,
                    smbEnabled: true,
                    smbHost: "nas.locale",
                    smbShare: "backup",
                    smbPath: "laboratorio",
                    smbPort: 1445,
                    smbDomain: "UFFICIO",
                    smbUsername: "utente-nas",
                    smbPassword: "segreta",
                })
            );
        });
    });

    it("la prova di connessione usa i valori scritti nei campi", async () => {
        api.testSmbConnection.mockResolvedValue({ message: "Connessione al NAS riuscita" });
        await renderPanel();

        await fillNasFields();
        await userEvent.click(screen.getByRole("button", { name: "Testa connessione" }));

        await waitFor(() => {
            expect(api.testSmbConnection).toHaveBeenCalledWith({
                host: "nas.locale",
                share: "backup",
                path: "laboratorio",
                domain: "UFFICIO",
                port: 1445,
                username: "utente-nas",
                password: "segreta",
            });
        });
    });

    /** Senza email configurata l'avviso non partirebbe: la casella resta spenta e lo spiega. */
    it("l'avviso email si può attivare solo con l'invio email configurato", async () => {
        await renderPanel();
        expect(screen.getByLabelText("Invia una email se il backup automatico non va a buon fine")).toBeDisabled();

        cleanup();
        api.getBackupSettings.mockResolvedValue({ ...settings, emailConfigured: true });
        api.updateBackupSettings.mockResolvedValue({ ...settings, emailConfigured: true });
        await renderPanel();

        await userEvent.click(screen.getByLabelText("Invia una email se il backup automatico non va a buon fine"));
        await userEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));

        await waitFor(() => {
            expect(api.updateBackupSettings).toHaveBeenCalledWith(
                expect.objectContaining({ notifyEmailOnFailure: true })
            );
        });
    });
});
