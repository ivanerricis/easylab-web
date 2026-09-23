import nodemailer from "nodemailer";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "./secretCrypto";
import { ApiError } from "./apiError";
import { createJsonSettingsStore } from "./jsonSettingsStore";

export type EmailSettingsState = {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    fromName: string;
    fromEmail: string;
    passwordEncrypted: string | null;
};

export type EmailConnectionConfig = {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
};

export type EmailConnectionTestConfig = EmailConnectionConfig & {
    fromName: string;
    fromEmail: string;
};

export class EmailManagerError extends ApiError {}

const defaultState: EmailSettingsState = {
    enabled: false,
    host: "",
    port: 587,
    secure: false,
    username: "",
    fromName: "",
    fromEmail: "",
    passwordEncrypted: null,
};

const sanitizeState = (input: Partial<EmailSettingsState>): EmailSettingsState => {
    const storedPort = Number(input.port ?? defaultState.port);
    // Una porta fuori regola nel file torna al default e il resto resta: prima faceva scartare
    // l'intero file, password cifrata compresa. Quella inviata dall'interfaccia la valida la rotta.
    const port = Number.isInteger(storedPort) && storedPort > 0 && storedPort <= 65535 ? storedPort : defaultState.port;

    return {
        enabled: Boolean(input.enabled ?? defaultState.enabled),
        host: typeof input.host === "string" ? input.host.trim() : defaultState.host,
        port,
        secure: Boolean(input.secure ?? defaultState.secure),
        username: typeof input.username === "string" ? input.username.trim() : defaultState.username,
        fromName: typeof input.fromName === "string" ? input.fromName.trim() : defaultState.fromName,
        fromEmail: typeof input.fromEmail === "string" ? input.fromEmail.trim() : defaultState.fromEmail,
        passwordEncrypted: typeof input.passwordEncrypted === "string" ? input.passwordEncrypted : null,
    };
};

const store = createJsonSettingsStore({
    fileName: "email-settings.json",
    defaults: defaultState,
    sanitize: sanitizeState,
});

const loadState = store.load;

// Dopo un ripristino il file delle impostazioni è stato riscritto da fuori:
// la cache in memoria non rispecchia più il disco.
export const invalidateEmailSettingsCache = store.invalidate;

// La password è cifrata con data/secret.key, che di proposito non finisce nei
// backup. Se il backup viene ripristinato dove la chiave è diversa, il valore
// resta illeggibile: va rilevato subito e non al primo invio di email.
export const isStoredEmailPasswordUsable = async () => {
    const state = await loadState();

    if (!state.passwordEncrypted) {
        return true;
    }

    try {
        await decryptSecret(state.passwordEncrypted);
        return true;
    } catch {
        return false;
    }
};

export type EmailSettingsPublic = Omit<EmailSettingsState, "passwordEncrypted"> & {
    passwordSet: boolean;
};

export const isEmailConfigured = async () => {
    const state = await loadState();
    return state.enabled && Boolean(state.host && state.username && state.fromEmail && state.passwordEncrypted);
};

const toPublicState = (state: EmailSettingsState): EmailSettingsPublic => {
    const { passwordEncrypted, ...rest } = state;
    return { ...rest, passwordSet: Boolean(passwordEncrypted) };
};

export const getEmailSettings = async (): Promise<EmailSettingsPublic> => {
    const state = await loadState();
    return toPublicState(state);
};

export type EmailSettingsInput = Pick<
    EmailSettingsState,
    "enabled" | "host" | "port" | "secure" | "username" | "fromName" | "fromEmail"
> & { password?: string };

export const updateEmailSettings = async (input: EmailSettingsInput) => {
    const current = await loadState();
    // Un oggetto nuovo, non la cache modificata sul posto: se la validazione qui sotto rifiuta,
    // in memoria deve restare quello che c'è su disco, non una configurazione mai salvata.
    const next: EmailSettingsState = {
        ...current,
        enabled: input.enabled,
        host: input.host.trim(),
        port: input.port,
        secure: input.secure,
        username: input.username.trim(),
        fromName: input.fromName.trim(),
        fromEmail: input.fromEmail.trim(),
        passwordEncrypted: input.password ? await encryptSecret(input.password) : current.passwordEncrypted,
    };

    if (next.enabled) {
        if (!next.host || !next.username || !next.fromEmail) {
            throw new EmailManagerError("Per abilitare l'invio email specifica host, utente ed email mittente", 400);
        }

        // La stessa regola usata da "Invia prova" (routes/settings.ts, emailTestSchema) e dai
        // clienti (routes/customers.ts): con la regex permissiva di prima un mittente accettato
        // qui da "Salva" poteva essere rifiutato lì da "Invia prova".
        if (!z.string().email().safeParse(next.fromEmail).success) {
            throw new EmailManagerError("L'email mittente non è valida", 400);
        }

        if (!next.passwordEncrypted) {
            throw new EmailManagerError("Specifica una password per l'account email", 400);
        }
    }

    await store.save(next);

    return toPublicState(next);
};

// Senza questi tetti nodemailer usa i suoi default (2 minuti per la connessione, 10 per il
// socket): con un SMTP irraggiungibile un invio innescato dal login (vedi `notifyIfNewDevice`
// in authManager.ts) resta appeso ben oltre i ~100s con cui Cloudflare Tunnel chiude la
// richiesta con un 524, lasciando la sessione già creata ma senza cookie in risposta.
const emailConnectionTimeoutMs = 10_000;
const emailGreetingTimeoutMs = 10_000;
const emailSocketTimeoutMs = 15_000;

const buildTransporter = (config: EmailConnectionConfig) =>
    nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        // Senza TLS implicito (la 587 del default) nodemailer usa STARTTLS solo se il server lo
        // annuncia: chi sta in mezzo toglie l'annuncio e l'autenticazione parte in chiaro,
        // password della casella compresa. Così invece la connessione si interrompe. Il
        // certificato resta verificato, perché `rejectUnauthorized` vale true di default.
        requireTLS: !config.secure,
        connectionTimeout: emailConnectionTimeoutMs,
        greetingTimeout: emailGreetingTimeoutMs,
        socketTimeout: emailSocketTimeoutMs,
        auth: {
            user: config.username,
            pass: config.password,
        },
    });

export const testEmailConnection = async (config: EmailConnectionTestConfig) => {
    const transporter = buildTransporter(config);

    try {
        await transporter.sendMail({
            from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
            to: config.fromEmail,
            subject: "Email di test - EasyLab",
            text: "Questa è una email di test per verificare le impostazioni SMTP configurate in EasyLab. Se la ricevi, la configurazione funziona correttamente.",
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Invio email di test non riuscito";
        throw new EmailManagerError(message, 502);
    }
};

type EmailAttachment = {
    filename: string;
    content: Buffer;
    contentType?: string;
    /**
     * Se valorizzato l'allegato non e' un file da scaricare ma un'immagine incorporata
     * nel corpo HTML (`<img src="cid:...">`): e' l'unico modo di mostrare il logo, dato
     * che i client di posta bloccano sia le immagini `data:` sia, spesso, quelle remote.
     */
    cid?: string;
};

export type SendEmailInput = {
    to: string;
    /**
     * Dove vanno le risposte, quando non devono tornare al mittente SMTP: l'email al cliente
     * lo invita a rispondere, e il mittente configurato può non essere la casella del laboratorio.
     */
    replyTo?: string;
    subject: string;
    text: string;
    /** Corpo HTML: quando c'e', `text` resta come alternativa per i client che non lo mostrano. */
    html?: string;
    attachments?: EmailAttachment[];
};

export const sendEmail = async (input: SendEmailInput) => {
    const state = await loadState();

    if (!state.enabled) {
        throw new EmailManagerError("L'invio email non è abilitato nelle impostazioni", 400);
    }

    if (!state.host || !state.username || !state.fromEmail || !state.passwordEncrypted) {
        throw new EmailManagerError("Le impostazioni email non sono configurate correttamente", 400);
    }

    const password = await decryptSecret(state.passwordEncrypted);
    const transporter = buildTransporter({
        host: state.host,
        port: state.port,
        secure: state.secure,
        username: state.username,
        password,
    });

    try {
        await transporter.sendMail({
            from: state.fromName ? `"${state.fromName}" <${state.fromEmail}>` : state.fromEmail,
            to: input.to,
            replyTo: input.replyTo,
            subject: input.subject,
            text: input.text,
            html: input.html,
            attachments: input.attachments?.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.content,
                contentType: attachment.contentType,
                cid: attachment.cid,
                contentDisposition: attachment.cid ? ("inline" as const) : ("attachment" as const),
            })),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Invio email non riuscito";
        throw new EmailManagerError(message, 502);
    }
};
