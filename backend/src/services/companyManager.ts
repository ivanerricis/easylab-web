import { ApiError } from "./apiError";
import { createJsonSettingsStore } from "./jsonSettingsStore";

export type CompanySettingsState = {
    name: string;
    email: string;
    address: string;
    phone: string;
    /**
     * Il fuso orario del laboratorio (nome IANA, es. `Europe/Rome`). Decide dove cominciano e
     * finiscono i giorni e i mesi per il server: filtri per data, incassi mensili, date su PDF ed
     * email, ora dei backup automatici. I timestamp nel database sono in UTC, quindi senza un
     * fuso dichiarato un report creato fra mezzanotte e le due finiva nel giorno prima.
     *
     * Sta qui, nei dati azienda, perché è un dato del laboratorio e perché questo file va già nei
     * backup e torna col ripristino.
     */
    timeZone: string;
};

export class CompanyManagerError extends ApiError {}

/** Il nome canonico del fuso (`europe/rome` → `Europe/Rome`), o null se non esiste. */
export const canonicalTimeZone = (value: string): string | null => {
    try {
        return new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).resolvedOptions().timeZone;
    } catch {
        return null;
    }
};

/**
 * Il fuso di chi non l'ha ancora scelto: quello del processo all'avvio (l'immagine imposta
 * `TZ=Europe/Rome`), letto qui una volta sola perché da quel momento `TZ` lo scrive
 * `applyTimeZone`. Così un'installazione esistente continua a comportarsi come prima.
 */
const initialTimeZone = canonicalTimeZone(process.env.TZ ?? "") ?? "Europe/Rome";

// Valori identici ai default storici di LAB_NAME/LAB_EMAIL/LAB_ADDRESS/LAB_PHONE in config/lab.ts,
// così il primo avvio senza company-settings.json non cambia nulla per chi già usa il .env.
const defaultState: CompanySettingsState = {
    name: process.env.LAB_NAME ?? "EasyLab",
    email: process.env.LAB_EMAIL ?? "info@easylab.local",
    address: process.env.LAB_ADDRESS ?? "Indirizzo laboratorio",
    phone: process.env.LAB_PHONE ?? "+39 000 000 0000",
    timeZone: initialTimeZone,
};

const sanitizeState = (input: Partial<CompanySettingsState>): CompanySettingsState => ({
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : defaultState.name,
    email: typeof input.email === "string" ? input.email.trim() : defaultState.email,
    address: typeof input.address === "string" ? input.address.trim() : defaultState.address,
    phone: typeof input.phone === "string" ? input.phone.trim() : defaultState.phone,
    timeZone: (typeof input.timeZone === "string" && canonicalTimeZone(input.timeZone)) || defaultState.timeZone,
});

/**
 * Il fuso scelto diventa quello del processo. È ciò che fa seguire il fuso anche al codice che
 * lavora con l'ora locale di `Date` — lo scheduler dei backup (`computeNextRunAt`) e i nomi degli
 * archivi — senza passarglielo a mano: Node rilegge `TZ` quando la si assegna.
 */
const applyTimeZone = (state: CompanySettingsState) => {
    if (process.env.TZ !== state.timeZone) {
        process.env.TZ = state.timeZone;
    }
};

const store = createJsonSettingsStore({
    fileName: "company-settings.json",
    defaults: defaultState,
    sanitize: sanitizeState,
});

const loadState = async () => {
    const state = await store.load();

    applyTimeZone(state);
    return state;
};

// Dopo un ripristino il file delle impostazioni è stato riscritto da fuori:
// la cache in memoria non rispecchia più il disco.
export const invalidateCompanySettingsCache = store.invalidate;

export const getCompanySettings = async (): Promise<CompanySettingsState> => loadState();

/** Il fuso orario del laboratorio: vedi `CompanySettingsState.timeZone`. */
export const getAppTimeZone = async (): Promise<string> => (await loadState()).timeZone;

/** Il fuso è facoltativo in ingresso: chi non lo manda tiene quello salvato. */
export type CompanySettingsInput = Omit<CompanySettingsState, "timeZone"> & { timeZone?: string };

export const updateCompanySettings = async (input: CompanySettingsInput) => {
    if (!input.name?.trim()) {
        throw new CompanyManagerError("Il nome dell'azienda è obbligatorio", 400);
    }

    if (input.timeZone !== undefined && !canonicalTimeZone(input.timeZone)) {
        throw new CompanyManagerError("Fuso orario non riconosciuto", 400);
    }

    const current = await loadState();
    const next = sanitizeState({ ...input, timeZone: input.timeZone ?? current.timeZone });
    await store.save(next);
    applyTimeZone(next);

    return next;
};
