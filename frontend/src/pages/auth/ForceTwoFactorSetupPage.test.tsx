import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const startTwoFactorSetup = vi.fn();
const enableTwoFactor = vi.fn();

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        startTwoFactorSetup: (...args: unknown[]) => startTwoFactorSetup(...args),
        enableTwoFactor: (...args: unknown[]) => enableTwoFactor(...args),
    };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AuthProviderContext, initialAuthProviderState } from "@/components/auth-provider-context";
import { renderWithProviders } from "@/test/render";
import ForceTwoFactorSetupPage from "./ForceTwoFactorSetupPage";

// Tre dialoghi Radix in fila: oltre i 5 secondi di default su una macchina lenta.
vi.setConfig({ testTimeout: 20000 });

const refresh = vi.fn();
const logout = vi.fn();

const renderPage = () =>
    renderWithProviders(
        <AuthProviderContext.Provider
            value={{
                ...initialAuthProviderState,
                isLoading: false,
                refresh,
                logout,
                user: {
                    id: 1,
                    username: "admin",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    mustChangePassword: false,
                    active: true,
                    isAdmin: true,
                    twoFactorEnabled: false,
                    twoFactorSetupRequired: true,
                },
            }}
        >
            <ForceTwoFactorSetupPage />
        </AuthProviderContext.Provider>
    );

beforeEach(() => {
    vi.clearAllMocks();
    refresh.mockResolvedValue(undefined);
});

describe("ForceTwoFactorSetupPage", () => {
    /**
     * `refresh` fa sparire questa pagina, e con lei i codici di recupero: chiamarlo appena la
     * 2FA è attiva li toglierebbe di mezzo prima che l'admin li abbia salvati, e non verrebbero
     * mostrati mai più.
     */
    it("configura la 2FA e rilegge l'utente solo dopo che i codici di recupero sono stati salvati", async () => {
        const user = userEvent.setup();
        startTwoFactorSetup.mockResolvedValue({
            secretBase32: "JBSWY3DPEHPK3PXP",
            otpauthUri: "otpauth://totp/x",
            qrDataUrl: "data:image/png;base64,AAAA",
        });
        enableTwoFactor.mockResolvedValue({ recoveryCodes: ["abcd-efgh", "ijkl-mnop"] });
        renderPage();

        await user.click(screen.getByRole("button", { name: "Configura adesso" }));
        await user.type(screen.getByLabelText(/^Password/), "la-mia-password");
        await user.click(screen.getByRole("button", { name: "Continua" }));

        expect(await screen.findByAltText("Codice QR per l'app di autenticazione")).toBeInTheDocument();
        expect(startTwoFactorSetup).toHaveBeenCalledWith("la-mia-password");

        await user.type(screen.getByLabelText(/^Codice di verifica/), "123456");
        await user.click(screen.getByRole("button", { name: "Attiva" }));

        const codesDialog = await screen.findByRole("dialog", { name: "Codici di recupero" });
        expect(within(codesDialog).getByText("abcd-efgh")).toBeInTheDocument();
        expect(refresh).not.toHaveBeenCalled();

        await user.click(within(codesDialog).getByLabelText("Ho salvato questi codici in un posto sicuro"));
        await user.click(within(codesDialog).getByRole("button", { name: "Ho salvato i codici, chiudi" }));

        await waitFor(() => {
            expect(refresh).toHaveBeenCalledOnce();
        });
    });

    it("permette di uscire", async () => {
        renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Esci" }));

        expect(logout).toHaveBeenCalled();
    });
});
