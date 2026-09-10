import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `emailManager` legge/scrive `data/email-settings.json` con `fs.promises` e non passa mai
 * dal db: qui si mocka `node:fs` (import default, come nel sorgente) invece del filesystem
 * reale, così i test non toccano `data/` e restano deterministici sul contenuto del file.
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

const decryptSecret = vi.fn();
const encryptSecret = vi.fn();

vi.mock("./secretCrypto", () => ({
    decryptSecret: (payload: string) => decryptSecret(payload) as Promise<string>,
    encryptSecret: (value: string) => encryptSecret(value) as Promise<string>,
}));

const sendMail = vi.fn();
const createTransport = vi.fn<(config: unknown) => { sendMail: typeof sendMail }>(() => ({ sendMail }));

vi.mock("nodemailer", () => ({
    default: { createTransport: (config: unknown) => createTransport(config) },
}));

import {
    EmailManagerError,
    getEmailSettings,
    invalidateEmailSettingsCache,
    isEmailConfigured,
    isStoredEmailPasswordUsable,
    sendEmail,
    testEmailConnection,
    updateEmailSettings,
    type EmailSettingsInput,
    type EmailSettingsState,
} from "./emailManager";

/** Stato come si trova già cifrato su disco: `updateEmailSettings` non lo tocca se non gli viene passata una nuova password. */
const storedState = (overrides: Partial<EmailSettingsState> = {}): EmailSettingsState => ({
    enabled: true,
    host: "smtp.easylab.it",
    port: 587,
    secure: false,
    username: "lab@easylab.it",
    fromName: "Laboratorio",
    fromEmail: "lab@easylab.it",
    passwordEncrypted: "iv:tag:data",
    ...overrides,
});

const enableInput = (overrides: Partial<EmailSettingsInput> = {}): EmailSettingsInput => ({
    enabled: true,
    host: "smtp.easylab.it",
    port: 587,
    secure: false,
    username: "lab@easylab.it",
    fromName: "Laboratorio",
    fromEmail: "lab@easylab.it",
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    invalidateEmailSettingsCache();
    // Senza file su disco `loadState` cade nel catch e riparte dai default: è lo stato
    // di partenza realistico di un'installazione appena creata.
    readFile.mockRejectedValue(new Error("ENOENT"));
    writeFile.mockResolvedValue(undefined);
    mkdir.mockResolvedValue(undefined);
    encryptSecret.mockImplementation(async (value: string) => `cifrato:${value}`);
    decryptSecret.mockImplementation(async (payload: string) => {
        if (!payload.startsWith("cifrato:")) {
            throw new Error("payload non riconosciuto");
        }
        return payload.slice("cifrato:".length);
    });
    sendMail.mockResolvedValue(undefined);
});

describe("invalidateEmailSettingsCache", () => {
    it("forza una nuova lettura dal disco alla chiamata successiva", async () => {
        await isEmailConfigured();
        expect(readFile).toHaveBeenCalledTimes(1);

        // Senza invalidare, lo stato resta in cache: nessuna nuova lettura.
        await isEmailConfigured();
        expect(readFile).toHaveBeenCalledTimes(1);

        invalidateEmailSettingsCache();
        await isEmailConfigured();
        expect(readFile).toHaveBeenCalledTimes(2);
    });
});

describe("isEmailConfigured", () => {
    it("è false sull'installazione appena creata (nessun file, stato di default)", async () => {
        expect(await isEmailConfigured()).toBe(false);
    });

    it("è true solo quando abilitato e con tutti i campi richiesti", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedState()));

        expect(await isEmailConfigured()).toBe(true);
    });

    it("è false se manca l'host anche con enabled true", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedState({ host: "" })));

        expect(await isEmailConfigured()).toBe(false);
    });
});

describe("isStoredEmailPasswordUsable", () => {
    it("è true quando non c'è nessuna password salvata (nulla da decifrare)", async () => {
        expect(await isStoredEmailPasswordUsable()).toBe(true);
        expect(decryptSecret).not.toHaveBeenCalled();
    });

    it("è true quando la password salvata si decifra correttamente", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedState({ passwordEncrypted: "cifrato:segreta" })));

        expect(await isStoredEmailPasswordUsable()).toBe(true);
        expect(decryptSecret).toHaveBeenCalledWith("cifrato:segreta");
    });

    // Caso reale: dopo un ripristino su una macchina con `data/secret.key` diverso il
    // payload cifrato non si decifra più. Va rilevato come "non usabile", non come eccezione.
    it("è false quando la chiave di decifratura non corrisponde più", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedState({ passwordEncrypted: "cifrato-con-altra-chiave" })));

        expect(await isStoredEmailPasswordUsable()).toBe(false);
    });
});

describe("getEmailSettings", () => {
    it("non espone mai la password cifrata, solo se è impostata", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedState()));

        const settings = await getEmailSettings();

        expect(settings).not.toHaveProperty("passwordEncrypted");
        expect(settings.passwordSet).toBe(true);
        expect(settings.host).toBe("smtp.easylab.it");
    });

    it("passwordSet è false sullo stato di default", async () => {
        const settings = await getEmailSettings();

        expect(settings.passwordSet).toBe(false);
    });
});

describe("updateEmailSettings", () => {
    it("salva i campi con i valori normalizzati (trim) quando l'invio resta disabilitato", async () => {
        // Stato già esistente su disco: evita il salvataggio implicito dei default che
        // `loadState` farebbe altrimenti al primo accesso, che confonderebbe il conteggio.
        readFile.mockResolvedValue(JSON.stringify(storedState({ enabled: false, passwordEncrypted: null })));

        const result = await updateEmailSettings(enableInput({ enabled: false, host: "  smtp.test  ", username: " u " }));

        expect(result.enabled).toBe(false);
        expect(result.host).toBe("smtp.test");
        expect(result.username).toBe("u");
        expect(writeFile).toHaveBeenCalledTimes(1);
    });

    it("rifiuta l'abilitazione senza host, utente o mittente", async () => {
        await expect(
            updateEmailSettings(enableInput({ host: "" }))
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            updateEmailSettings(enableInput({ password: "segreta" }))
        ).resolves.toMatchObject({ enabled: true });
    });

    it("rifiuta un'email mittente malformata", async () => {
        await expect(
            updateEmailSettings(enableInput({ fromEmail: "non-una-email", password: "segreta" }))
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rifiuta l'abilitazione senza nessuna password, né nuova né già salvata", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedState({ enabled: false, passwordEncrypted: null })));

        await expect(updateEmailSettings(enableInput())).rejects.toMatchObject({ statusCode: 400 });
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("cifra la nuova password e la salva", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedState({ enabled: false, passwordEncrypted: null })));

        const result = await updateEmailSettings(enableInput({ password: "segreta" }));

        expect(encryptSecret).toHaveBeenCalledWith("segreta");
        expect(result.passwordSet).toBe(true);
        const [, payload] = writeFile.mock.calls[0] as [string, string];
        expect(payload).toContain("cifrato:segreta");
    });

    it("mantiene la password già salvata quando non ne viene fornita una nuova", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedState({ enabled: false })));

        const result = await updateEmailSettings(enableInput());

        expect(result.enabled).toBe(true);
        expect(result.passwordSet).toBe(true);
        expect(encryptSecret).not.toHaveBeenCalled();
    });

    it("tutti gli errori di validazione sono EmailManagerError", async () => {
        await expect(updateEmailSettings(enableInput())).rejects.toBeInstanceOf(EmailManagerError);
    });
});

describe("testEmailConnection", () => {
    const config = {
        host: "smtp.easylab.it",
        port: 587,
        secure: false,
        username: "lab@easylab.it",
        password: "segreta",
        fromName: "Laboratorio",
        fromEmail: "lab@easylab.it",
    };

    it("apre la connessione con le credenziali passate e invia il messaggio di prova", async () => {
        await testEmailConnection(config);

        expect(createTransport).toHaveBeenCalledWith(
            expect.objectContaining({
                host: config.host,
                port: config.port,
                auth: { user: config.username, pass: config.password },
            })
        );
        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                from: `"Laboratorio" <lab@easylab.it>`,
                to: config.fromEmail,
                subject: expect.stringContaining("test"),
            })
        );
    });

    it("usa solo l'indirizzo quando manca il nome mittente", async () => {
        await testEmailConnection({ ...config, fromName: "" });

        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: config.fromEmail }));
    });

    it("traduce l'errore SMTP in EmailManagerError 502", async () => {
        sendMail.mockRejectedValue(new Error("Connessione rifiutata"));

        await expect(testEmailConnection(config)).rejects.toMatchObject({
            statusCode: 502,
            message: "Connessione rifiutata",
        });
    });

    it("usa un messaggio di fallback quando l'errore non è un Error", async () => {
        sendMail.mockRejectedValue("boom");

        await expect(testEmailConnection(config)).rejects.toMatchObject({
            statusCode: 502,
            message: "Invio email di test non riuscito",
        });
    });
});

describe("sendEmail", () => {
    const input = { to: "cliente@example.com", subject: "Oggetto", text: "Corpo" };

    it("rifiuta con 400 quando l'invio non è abilitato", async () => {
        await expect(sendEmail(input)).rejects.toMatchObject({ statusCode: 400 });
        expect(sendMail).not.toHaveBeenCalled();
    });

    it("rifiuta con 400 quando la configurazione è incompleta anche se enabled è true", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedState({ host: "" })));

        await expect(sendEmail(input)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("invia con la password decifrata e il mittente formattato", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedState({ passwordEncrypted: "cifrato:segreta" })));

        await sendEmail(input);

        expect(decryptSecret).toHaveBeenCalledWith("cifrato:segreta");
        expect(createTransport).toHaveBeenCalledWith(
            expect.objectContaining({ auth: { user: "lab@easylab.it", pass: "segreta" } })
        );
        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ from: `"Laboratorio" <lab@easylab.it>`, to: input.to, subject: input.subject })
        );
    });

    // Il `cid` è ciò che distingue un logo incorporato nell'HTML da un allegato scaricabile:
    // deve tradursi nella `contentDisposition` giusta per ogni allegato.
    it("distingue allegati inline (con cid) da allegati normali", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedState({ passwordEncrypted: "cifrato:segreta" })));

        await sendEmail({
            ...input,
            attachments: [
                { filename: "logo.png", content: Buffer.from("x"), cid: "logo@easylab" },
                { filename: "intervento.pdf", content: Buffer.from("y") },
            ],
        });

        const sent = sendMail.mock.calls[0][0] as { attachments: { contentDisposition: string }[] };
        expect(sent.attachments[0].contentDisposition).toBe("inline");
        expect(sent.attachments[1].contentDisposition).toBe("attachment");
    });

    it("traduce un fallimento SMTP in EmailManagerError 502", async () => {
        readFile.mockResolvedValue(JSON.stringify(storedState({ passwordEncrypted: "cifrato:segreta" })));
        sendMail.mockRejectedValue(new Error("Timeout"));

        await expect(sendEmail(input)).rejects.toMatchObject({ statusCode: 502, message: "Timeout" });
    });
});
