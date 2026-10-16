import { beforeEach, describe, expect, it, vi } from "vitest";

const isEmailConfigured = vi.fn<() => Promise<boolean>>();
const getEmailSettings = vi.fn<() => Promise<{ alertEmail: string }>>();
const sendEmail = vi.fn<(input: { to: string; subject: string; text: string }) => Promise<void>>();

vi.mock("./emailManager", () => ({
    isEmailConfigured: () => isEmailConfigured(),
    getEmailSettings: () => getEmailSettings(),
    sendEmail: (input: { to: string; subject: string; text: string }) => sendEmail(input),
}));

const getCompanySettings = vi.fn<() => Promise<{ email: string }>>();

vi.mock("./companyManager", () => ({
    getCompanySettings: () => getCompanySettings(),
}));

import { sendAlertEmail } from "./alertEmail";

const message = { subject: "Oggetto", text: "Testo" };

beforeEach(() => {
    vi.clearAllMocks();
    isEmailConfigured.mockResolvedValue(true);
    getEmailSettings.mockResolvedValue({ alertEmail: "" });
    getCompanySettings.mockResolvedValue({ email: "" });
    sendEmail.mockResolvedValue(undefined);
});

describe("sendAlertEmail", () => {
    it("scrive all'email degli avvisi quando c'è", async () => {
        getEmailSettings.mockResolvedValue({ alertEmail: "tecnico@example.com" });
        getCompanySettings.mockResolvedValue({ email: "lab@example.com" });

        await sendAlertEmail(message);

        expect(sendEmail).toHaveBeenCalledWith({ to: "tecnico@example.com", ...message });
    });

    it("ricade sull'email dell'azienda se quella degli avvisi è vuota", async () => {
        getCompanySettings.mockResolvedValue({ email: "lab@example.com" });

        await sendAlertEmail(message);

        expect(sendEmail).toHaveBeenCalledWith({ to: "lab@example.com", ...message });
    });

    it("non invia se mancano entrambe le email", async () => {
        await sendAlertEmail(message);

        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("non invia se l'email non è configurata", async () => {
        isEmailConfigured.mockResolvedValue(false);
        getEmailSettings.mockResolvedValue({ alertEmail: "tecnico@example.com" });

        await sendAlertEmail(message);

        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("lascia passare l'errore di invio a chi chiama", async () => {
        getEmailSettings.mockResolvedValue({ alertEmail: "tecnico@example.com" });
        sendEmail.mockRejectedValue(new Error("SMTP giù"));

        await expect(sendAlertEmail(message)).rejects.toThrow("SMTP giù");
    });
});
