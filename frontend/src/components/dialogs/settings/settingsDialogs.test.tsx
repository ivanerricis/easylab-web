import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const changeOwnPassword = vi.fn();
const startTwoFactorSetup = vi.fn();
const enableTwoFactor = vi.fn();
const createUser = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();
const downloadTextFile = vi.fn();

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        changeOwnPassword: (...args: unknown[]) => changeOwnPassword(...args),
        startTwoFactorSetup: (...args: unknown[]) => startTwoFactorSetup(...args),
        enableTwoFactor: (...args: unknown[]) => enableTwoFactor(...args),
        createUser: (...args: unknown[]) => createUser(...args),
    };
});

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
        success: (...args: unknown[]) => toastSuccess(...args),
    },
}));

vi.mock("@/lib/downloadTextFile", () => ({
    downloadTextFile: (...args: unknown[]) => downloadTextFile(...args),
}));

import ChangePasswordDialog from "./changePasswordDialog";
import CopyableValue from "./copyableValue";
import CreateUserDialog from "./createUserDialog";
import GeneratedPasswordDialog from "./generatedPasswordDialog";
import RecoveryCodesDialog from "./recoveryCodesDialog";
import TwoFactorConfirmDialog from "./twoFactorConfirmDialog";
import TwoFactorSetupDialog from "./twoFactorSetupDialog";
import { renderWithProviders } from "@/test/render";

const writeText = vi.fn();

/** Un rifiuto del server com'è davvero: axios, con lo stato e il messaggio nel corpo. */
const buildAxiosError = (message: string, status: number) => {
    const config = { headers: new AxiosHeaders() };
    return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null, {
        data: { message },
        status,
        statusText: "Error",
        headers: {},
        config,
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    writeText.mockResolvedValue(undefined);
});

describe("ChangePasswordDialog", () => {
    const requirementItems = () => screen.getAllByRole("listitem");

    const requirementStates = () => requirementItems().map((item) => item.getAttribute("data-state"));

    /** Appena aperto non si è ancora sbagliato niente: i requisiti non devono essere già rossi. */
    it("mostra i requisiti neutri finché non si scrive la nuova password", async () => {
        renderWithProviders(<ChangePasswordDialog open onOpenChange={() => {}} />);

        expect(requirementStates()).toEqual(["idle", "idle", "idle"]);
        expect(requirementItems()[0]).toHaveTextContent("non ancora verificato");

        await userEvent.type(screen.getByLabelText(/^Nuova password/), "a");

        expect(requirementStates()).toContain("unmet");
        expect(requirementStates()).not.toContain("idle");
    });

    /** La checklist accende i requisiti man mano che si scrive, prima di premere Salva. */
    it("spunta i requisiti mentre si digita, anche a parole per chi non vede i colori", async () => {
        renderWithProviders(<ChangePasswordDialog open onOpenChange={() => {}} />);

        await userEvent.type(screen.getByLabelText(/^Nuova password/), "abcdefgh1");

        expect(requirementStates()).toEqual(["met", "met", "unmet"]);
        const met = requirementItems().filter((item) => item.getAttribute("data-state") === "met");
        expect(met.map((item) => item.textContent)).toEqual([
            "Almeno 8 caratterisoddisfatto",
            "Almeno un numerosoddisfatto",
        ]);
        expect(requirementItems()[2]).toHaveTextContent("Almeno un carattere specialenon soddisfatto");
        expect(requirementItems().some((item) => item.className.includes("line-through"))).toBe(false);
    });

    it("ha un occhio per ciascuno dei tre campi, con stato indipendente", async () => {
        renderWithProviders(<ChangePasswordDialog open onOpenChange={() => {}} />);
        const current = screen.getByLabelText(/^Password attuale/);
        const next = screen.getByLabelText(/^Nuova password/);
        const confirm = screen.getByLabelText(/^Conferma nuova password/);

        await userEvent.click(screen.getByRole("button", { name: "Mostra nuova password" }));

        expect(next).toHaveAttribute("type", "text");
        expect(current).toHaveAttribute("type", "password");
        expect(confirm).toHaveAttribute("type", "password");
        expect(screen.getByRole("button", { name: "Nascondi nuova password" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Mostra conferma password" }));
        await userEvent.click(screen.getByRole("button", { name: "Mostra password attuale" }));

        expect(current).toHaveAttribute("type", "text");
        expect(confirm).toHaveAttribute("type", "text");

        await userEvent.click(screen.getByRole("button", { name: "Nascondi nuova password" }));

        expect(next).toHaveAttribute("type", "password");
        expect(current).toHaveAttribute("type", "text");
    });

    it("salva, avvisa e chiude svuotando il form", async () => {
        changeOwnPassword.mockResolvedValue(undefined);
        const onOpenChange = vi.fn();
        renderWithProviders(<ChangePasswordDialog open onOpenChange={onOpenChange} />);

        await userEvent.type(screen.getByLabelText(/^Password attuale/), "vecchia");
        await userEvent.type(screen.getByLabelText(/^Nuova password/), "nuova-pass1!");
        await userEvent.type(screen.getByLabelText(/^Conferma nuova password/), "nuova-pass1!");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });
        expect(changeOwnPassword).toHaveBeenCalledWith({ currentPassword: "vecchia", newPassword: "nuova-pass1!" });
        expect(toastSuccess).toHaveBeenCalledWith("Password aggiornata con successo");
        expect(screen.getByLabelText(/^Password attuale/)).toHaveValue("");
    });

    it("segnala sotto ciascun campo quello che manca, con il focus sul primo", async () => {
        renderWithProviders(<ChangePasswordDialog open onOpenChange={() => {}} />);

        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        const currentPassword = screen.getByLabelText(/^Password attuale/);
        expect(currentPassword).toHaveAccessibleDescription("Inserisci la password attuale");
        expect(screen.getByLabelText(/^Nuova password/)).toHaveAccessibleDescription(
            "La password non rispetta tutti i requisiti"
        );
        expect(screen.getByLabelText(/^Conferma nuova password/)).toHaveAccessibleDescription(
            "Ripeti la nuova password"
        );
        expect(currentPassword).toHaveFocus();
        expect(toastError).not.toHaveBeenCalled();

        // Scrivere nel campo toglie il suo errore, non quello degli altri.
        await userEvent.type(currentPassword, "v");
        expect(currentPassword).not.toHaveAccessibleDescription();
        expect(screen.getByLabelText(/^Nuova password/)).toHaveAccessibleDescription(
            "La password non rispetta tutti i requisiti"
        );
        expect(changeOwnPassword).not.toHaveBeenCalled();
    });

    it("non invia due password diverse fra loro", async () => {
        renderWithProviders(<ChangePasswordDialog open onOpenChange={() => {}} />);

        await userEvent.type(screen.getByLabelText(/^Password attuale/), "vecchia");
        await userEvent.type(screen.getByLabelText(/^Nuova password/), "nuova-pass1!");
        await userEvent.type(screen.getByLabelText(/^Conferma nuova password/), "nuova-pass2!");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        expect(screen.getByLabelText(/^Conferma nuova password/)).toHaveAccessibleDescription(
            "Le due password inserite non coincidono"
        );
        expect(screen.getByLabelText(/^Conferma nuova password/)).toHaveFocus();
        expect(changeOwnPassword).not.toHaveBeenCalled();
    });

    it("mette sotto la password attuale il rifiuto del server", async () => {
        changeOwnPassword.mockRejectedValue(buildAxiosError("La password attuale non è corretta", 400));
        const onOpenChange = vi.fn();
        renderWithProviders(<ChangePasswordDialog open onOpenChange={onOpenChange} />);

        await userEvent.type(screen.getByLabelText(/^Password attuale/), "sbagliata");
        await userEvent.type(screen.getByLabelText(/^Nuova password/), "nuova-pass1!");
        await userEvent.type(screen.getByLabelText(/^Conferma nuova password/), "nuova-pass1!");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(screen.getByLabelText(/^Password attuale/)).toHaveAccessibleDescription(
                "La password attuale non è corretta"
            );
        });
        expect(screen.getByLabelText(/^Password attuale/)).toHaveFocus();
        expect(toastError).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("lascia al toast gli errori che non riguardano un campo", async () => {
        changeOwnPassword.mockRejectedValue(buildAxiosError("Errore interno", 500));
        renderWithProviders(<ChangePasswordDialog open onOpenChange={() => {}} />);

        await userEvent.type(screen.getByLabelText(/^Password attuale/), "vecchia");
        await userEvent.type(screen.getByLabelText(/^Nuova password/), "nuova-pass1!");
        await userEvent.type(screen.getByLabelText(/^Conferma nuova password/), "nuova-pass1!");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Errore interno");
        });
        expect(screen.getByLabelText(/^Password attuale/)).not.toHaveAccessibleDescription();
    });
});

describe("TwoFactorSetupDialog", () => {
    it("chiede la password, poi mostra il QR e attiva con il codice", async () => {
        startTwoFactorSetup.mockResolvedValue({
            secretBase32: "JBSWY3DPEHPK3PXP",
            otpauthUri: "otpauth://totp/x",
            qrDataUrl: "data:image/png;base64,AAAA",
        });
        enableTwoFactor.mockResolvedValue({ recoveryCodes: ["aaaa-bbbb"] });
        const onEnabled = vi.fn();
        const onOpenChange = vi.fn();
        renderWithProviders(<TwoFactorSetupDialog open onOpenChange={onOpenChange} onEnabled={onEnabled} />);

        await userEvent.type(screen.getByLabelText(/^Password/), "segreta1!");
        await userEvent.click(screen.getByRole("button", { name: "Continua" }));

        expect(await screen.findByRole("img", { name: /Codice QR/ })).toHaveAttribute(
            "src",
            "data:image/png;base64,AAAA"
        );
        expect(screen.getByLabelText("Oppure inserisci questo codice a mano")).toHaveValue("JBSWY3DPEHPK3PXP");
        expect(startTwoFactorSetup).toHaveBeenCalledWith("segreta1!");

        await userEvent.type(screen.getByLabelText(/^Codice di verifica/), "123456");
        await userEvent.click(screen.getByRole("button", { name: "Attiva" }));

        await waitFor(() => {
            expect(onEnabled).toHaveBeenCalledWith(["aaaa-bbbb"]);
        });
        expect(enableTwoFactor).toHaveBeenCalledWith("123456");
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("al passo del QR mette subito il focus sul campo del codice", async () => {
        startTwoFactorSetup.mockResolvedValue({ secretBase32: "S", otpauthUri: "", qrDataUrl: "data:," });
        renderWithProviders(<TwoFactorSetupDialog open onOpenChange={() => {}} onEnabled={() => {}} />);

        await userEvent.type(screen.getByLabelText(/^Password/), "segreta1!");
        await userEvent.click(screen.getByRole("button", { name: "Continua" }));

        const codeInput = await screen.findByLabelText(/^Codice di verifica/);
        await waitFor(() => expect(codeInput).toHaveFocus());
    });

    it("con un codice sbagliato resta sul QR, svuota il campo e dice perché sotto il campo", async () => {
        startTwoFactorSetup.mockResolvedValue({ secretBase32: "S", otpauthUri: "", qrDataUrl: "data:," });
        enableTwoFactor.mockRejectedValue(buildAxiosError("Il codice non è corretto", 400));
        const onEnabled = vi.fn();
        renderWithProviders(<TwoFactorSetupDialog open onOpenChange={() => {}} onEnabled={onEnabled} />);

        await userEvent.type(screen.getByLabelText(/^Password/), "segreta1!");
        await userEvent.click(screen.getByRole("button", { name: "Continua" }));
        await userEvent.type(await screen.findByLabelText(/^Codice di verifica/), "000000");
        await userEvent.click(screen.getByRole("button", { name: "Attiva" }));

        await waitFor(() => {
            expect(screen.getByLabelText(/^Codice di verifica/)).toHaveAccessibleDescription(
                "Il codice non è corretto"
            );
        });
        expect(screen.getByLabelText(/^Codice di verifica/)).toHaveValue("");
        expect(screen.getByLabelText(/^Codice di verifica/)).toHaveFocus();
        expect(toastError).not.toHaveBeenCalled();
        expect(onEnabled).not.toHaveBeenCalled();
    });

    it("con la rete giù avvisa con un toast, non sotto il codice", async () => {
        startTwoFactorSetup.mockResolvedValue({ secretBase32: "S", otpauthUri: "", qrDataUrl: "data:," });
        enableTwoFactor.mockRejectedValue(new Error("Network Error"));
        renderWithProviders(<TwoFactorSetupDialog open onOpenChange={() => {}} onEnabled={() => {}} />);

        await userEvent.type(screen.getByLabelText(/^Password/), "segreta1!");
        await userEvent.click(screen.getByRole("button", { name: "Continua" }));
        await userEvent.type(await screen.findByLabelText(/^Codice di verifica/), "000000");
        await userEvent.click(screen.getByRole("button", { name: "Attiva" }));

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Network Error");
        });
        expect(screen.getByLabelText(/^Codice di verifica/)).not.toHaveAccessibleDescription();
    });

    it("non avvia la configurazione senza password", async () => {
        renderWithProviders(<TwoFactorSetupDialog open onOpenChange={() => {}} onEnabled={() => {}} />);

        await userEvent.click(screen.getByRole("button", { name: "Continua" }));

        expect(screen.getByLabelText(/^Password/)).toHaveAccessibleDescription("Inserisci la tua password");
        expect(screen.getByLabelText(/^Password/)).toHaveFocus();
        expect(toastError).not.toHaveBeenCalled();
        expect(startTwoFactorSetup).not.toHaveBeenCalled();
    });

    it("mette sotto la password il rifiuto del server", async () => {
        startTwoFactorSetup.mockRejectedValue(buildAxiosError("La password non è corretta", 400));
        renderWithProviders(<TwoFactorSetupDialog open onOpenChange={() => {}} onEnabled={() => {}} />);

        await userEvent.type(screen.getByLabelText(/^Password/), "sbagliata");
        await userEvent.click(screen.getByRole("button", { name: "Continua" }));

        await waitFor(() => {
            expect(screen.getByLabelText(/^Password/)).toHaveAccessibleDescription("La password non è corretta");
        });
        expect(toastError).not.toHaveBeenCalled();
    });
});

describe("TwoFactorConfirmDialog", () => {
    const renderConfirm = (onConfirm: (password: string, code: string) => Promise<void>, onOpenChange = vi.fn()) =>
        renderWithProviders(
            <TwoFactorConfirmDialog
                open
                onOpenChange={onOpenChange}
                title="Disattiva"
                description="Conferma"
                confirmLabel="Disattiva"
                submittingLabel="Disattivazione..."
                onConfirm={onConfirm}
            />
        );

    it("tiene spento il pulsante finché password e codice non hanno la forma giusta", async () => {
        const onConfirm = vi.fn();
        renderConfirm(onConfirm);
        const confirm = screen.getByRole("button", { name: "Disattiva" });
        const codeInput = screen.getByLabelText(/^Codice di verifica o di recupero/);

        expect(confirm).toBeDisabled();

        await userEvent.type(screen.getByLabelText(/^Password/), "segreta1!");
        expect(confirm).toBeDisabled();

        // Sei cifre dell'app, ma ne mancano.
        await userEvent.type(codeInput, "12345");
        expect(confirm).toBeDisabled();
        await userEvent.type(codeInput, "6");
        expect(confirm).toBeEnabled();

        // Un codice di recupero: otto caratteri, con trattino o minuscole non cambia.
        await userEvent.clear(codeInput);
        await userEvent.type(codeInput, "abcd-23");
        expect(confirm).toBeDisabled();
        await userEvent.type(codeInput, "45");
        expect(confirm).toBeEnabled();

        // Caratteri che l'alfabeto dei codici non usa (O, I, 0, 1).
        await userEvent.clear(codeInput);
        await userEvent.type(codeInput, "ABCD-OI01");
        expect(confirm).toBeDisabled();

        await userEvent.clear(screen.getByLabelText(/^Password/));
        await userEvent.clear(codeInput);
        await userEvent.type(codeInput, "123456");
        expect(confirm).toBeDisabled();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it.each([
        ["La password non è corretta", /^Password/],
        ["Il codice non è corretto", /^Codice di verifica o di recupero/],
    ])("mostra il rifiuto del server sotto il campo che nomina: %s", async (message, label) => {
        const onConfirm = vi.fn().mockRejectedValue(buildAxiosError(message, 400));
        const onOpenChange = vi.fn();
        renderConfirm(onConfirm, onOpenChange);

        await userEvent.type(screen.getByLabelText(/^Password/), "segreta1!");
        await userEvent.type(screen.getByLabelText(/^Codice di verifica o di recupero/), "123456");
        await userEvent.click(screen.getByRole("button", { name: "Disattiva" }));

        const field = await screen.findByLabelText(label);
        await waitFor(() => expect(field).toHaveAccessibleDescription(message));
        expect(field).toHaveFocus();
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it("conferma e chiude", async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        const onOpenChange = vi.fn();
        renderConfirm(onConfirm, onOpenChange);

        await userEvent.type(screen.getByLabelText(/^Password/), "segreta1!");
        await userEvent.type(screen.getByLabelText(/^Codice di verifica o di recupero/), " 123456 ");
        await userEvent.click(screen.getByRole("button", { name: "Disattiva" }));

        await waitFor(() => {
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });
        expect(onConfirm).toHaveBeenCalledWith("segreta1!", "123456");
    });

    /**
     * Chi passa `onConfirm` mostra l'errore e poi lo rilancia apposta, per tenere il dialogo
     * aperto: qui va solo riabilitato il form, senza chiudere. Il test fallisce anche se il
     * rifiuto sfugge al dialogo, perché vitest segnala le promesse rifiutate non gestite.
     */
    it("resta aperto e riprovabile quando la conferma fallisce", async () => {
        const onConfirm = vi.fn().mockRejectedValue(new Error("Codice non valido"));
        const onOpenChange = vi.fn();
        renderConfirm(onConfirm, onOpenChange);

        await userEvent.type(screen.getByLabelText(/^Password/), "segreta1!");
        await userEvent.type(screen.getByLabelText(/^Codice di verifica o di recupero/), "000000");
        await userEvent.click(screen.getByRole("button", { name: "Disattiva" }));

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Disattiva" })).toBeEnabled();
        });
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(screen.getByLabelText(/^Password/)).toHaveValue("segreta1!");
    });
});

describe("RecoveryCodesDialog", () => {
    /** È l'unica volta che i codici esistono in chiaro: chiudere per distrazione li perde. */
    it("non si chiude finché non si conferma di averli salvati", async () => {
        const onOpenChange = vi.fn();
        renderWithProviders(
            <RecoveryCodesDialog open onOpenChange={onOpenChange} codes={["aaaa-1111", "bbbb-2222"]} />
        );
        const close = screen.getByRole("button", { name: "Ho salvato i codici, chiudi" });

        expect(screen.getByText("aaaa-1111")).toBeInTheDocument();
        expect(close).toBeDisabled();
        expect(screen.queryByRole("button", { name: "Annulla" })).not.toBeInTheDocument();

        await userEvent.click(screen.getByLabelText("Ho salvato questi codici in un posto sicuro"));
        await userEvent.click(close);

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("copia tutti i codici, uno per riga", async () => {
        renderWithProviders(<RecoveryCodesDialog open onOpenChange={() => {}} codes={["aaaa-1111", "bbbb-2222"]} />);

        await userEvent.click(screen.getByRole("button", { name: "Copia tutti i codici" }));

        expect(writeText).toHaveBeenCalledWith("aaaa-1111\nbbbb-2222");
        expect(toastSuccess).toHaveBeenCalledWith("Codici copiati negli appunti");
    });

    it("numera i codici con il numero separato dal codice", () => {
        renderWithProviders(<RecoveryCodesDialog open onOpenChange={() => {}} codes={["aaaa-1111", "bbbb-2222"]} />);

        expect(screen.getAllByRole("listitem")).toHaveLength(2);
        expect(screen.getByText("aaaa-1111")).toBeInTheDocument();
        expect(screen.getByText("bbbb-2222").previousElementSibling).toHaveTextContent("2");
    });

    it("scarica i codici come file di testo numerato, senza spuntare la conferma", async () => {
        renderWithProviders(<RecoveryCodesDialog open onOpenChange={() => {}} codes={["aaaa-1111", "bbbb-2222"]} />);

        await userEvent.click(screen.getByRole("button", { name: "Scarica .txt" }));

        expect(downloadTextFile).toHaveBeenCalledTimes(1);
        const [fileName, content] = downloadTextFile.mock.calls[0] as [string, string];
        expect(fileName).toBe("codici-di-recupero.txt");
        expect(content).toContain("1. aaaa-1111\n2. bbbb-2222");
        expect(screen.getByRole("checkbox")).not.toBeChecked();
        expect(screen.getByRole("button", { name: "Ho salvato i codici, chiudi" })).toBeDisabled();
    });

    it("rimette il pulsante di copia com'era dopo un attimo", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            renderWithProviders(<RecoveryCodesDialog open onOpenChange={() => {}} codes={["aaaa-1111"]} />);
            const copy = screen.getByRole("button", { name: "Copia tutti i codici" });

            await userEvent.click(copy);
            expect(copy.querySelector("svg")).toHaveClass("lucide-check");

            await act(async () => {
                await vi.advanceTimersByTimeAsync(2100);
            });
            expect(copy.querySelector("svg")).toHaveClass("lucide-copy");
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("CopyableValue e GeneratedPasswordDialog", () => {
    it("copia la password generata", async () => {
        renderWithProviders(
            <GeneratedPasswordDialog open onOpenChange={() => {}} username="luigi" password="Xy7!abcdEFGH" />
        );

        expect(screen.getByRole("dialog")).toHaveAccessibleDescription(expect.stringContaining('"luigi"'));
        await userEvent.click(screen.getByRole("button", { name: "Copia password" }));

        expect(writeText).toHaveBeenCalledWith("Xy7!abcdEFGH");
        expect(toastSuccess).toHaveBeenCalledWith("Password copiata negli appunti");
    });

    it("avvisa quando gli appunti non sono disponibili", async () => {
        writeText.mockRejectedValue(new Error("NotAllowedError"));
        renderWithProviders(
            <CopyableValue id="x" label="Segreto" value="abc" copiedMessage="Copiato" errorMessage="Non copiato" />
        );

        await userEvent.click(screen.getByRole("button", { name: "Copia segreto" }));

        expect(toastError).toHaveBeenCalledWith("Non copiato");
        // Il valore resta selezionabile a mano.
        expect(screen.getByLabelText("Segreto")).toHaveValue("abc");
    });
});

describe("CreateUserDialog", () => {
    it("crea l'utente con il nome ripulito e passa il risultato", async () => {
        const result = { user: { id: 2, username: "luigi" }, generatedPassword: "pw" };
        createUser.mockResolvedValue(result);
        const onCreated = vi.fn();
        const onOpenChange = vi.fn();
        renderWithProviders(<CreateUserDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);

        await userEvent.type(screen.getByLabelText(/^Nome utente/), "  luigi ");
        await userEvent.click(screen.getByRole("button", { name: "Crea utente" }));

        await waitFor(() => {
            expect(onCreated).toHaveBeenCalledWith(result);
        });
        expect(createUser).toHaveBeenCalledWith("luigi");
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("rifiuta il nome vuoto", async () => {
        renderWithProviders(<CreateUserDialog open onOpenChange={() => {}} onCreated={() => {}} />);

        await userEvent.click(screen.getByRole("button", { name: "Crea utente" }));

        expect(screen.getByLabelText(/^Nome utente/)).toHaveAccessibleDescription(
            "Il nome utente non può essere vuoto"
        );
        expect(screen.getByLabelText(/^Nome utente/)).toHaveFocus();
        expect(toastError).not.toHaveBeenCalled();
        expect(createUser).not.toHaveBeenCalled();
    });
});
