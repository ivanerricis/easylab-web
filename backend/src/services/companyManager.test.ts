import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stesso schema del mock fs usato altrove per i servizi che scrivono su disco: solo
// `promises` interessa, il resto del modulo non viene toccato dal codice sotto test.
const mkdir = vi.fn();
const writeFile = vi.fn();
const readFile = vi.fn();

vi.mock("node:fs", () => {
    const promises = {
        mkdir: (...args: unknown[]) => mkdir(...args),
        writeFile: (...args: unknown[]) => writeFile(...args),
        readFile: (...args: unknown[]) => readFile(...args),
    };
    return { default: { promises }, promises };
});

import {
    canonicalTimeZone,
    CompanyManagerError,
    getAppTimeZone,
    getCompanySettings,
    invalidateCompanySettingsCache,
    updateCompanySettings,
} from "./companyManager";

// Stessi fallback del modulo: letti dall'ambiente invece che ricopiati a mano, così il
// test non si disallinea se l'ambiente di CI definisce le variabili LAB_*.
const defaultCompanyState = {
    name: process.env.LAB_NAME ?? "EasyLab",
    email: process.env.LAB_EMAIL ?? "info@easylab.local",
    address: process.env.LAB_ADDRESS ?? "Indirizzo laboratorio",
    phone: process.env.LAB_PHONE ?? "+39 000 000 0000",
    // Il fuso del processo all'avvio, o Europe/Rome se non è impostato: vedi `initialTimeZone`.
    timeZone: canonicalTimeZone(process.env.TZ ?? "") ?? "Europe/Rome",
};

// Il modulo scrive `process.env.TZ`: va rimesso com'era, perché resta nel processo dei test.
const originalTz = process.env.TZ;

afterEach(() => {
    if (originalTz === undefined) {
        delete process.env.TZ;
    } else {
        process.env.TZ = originalTz;
    }
});

beforeEach(() => {
    vi.clearAllMocks();
    // La cache è in memoria a livello di modulo: senza invalidarla uno stato letto in
    // un test resterebbe visibile ai successivi.
    invalidateCompanySettingsCache();
    mkdir.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);
});

describe("getCompanySettings", () => {
    it("al primo avvio senza file usa i default e li scrive su disco", async () => {
        readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

        const state = await getCompanySettings();

        expect(state).toEqual(defaultCompanyState);
        expect(mkdir).toHaveBeenCalled();
        expect(writeFile).toHaveBeenCalledWith(
            expect.stringContaining("company-settings.json"),
            expect.stringContaining(defaultCompanyState.name),
            "utf-8"
        );
    });

    it("legge e sanifica lo stato salvato su disco", async () => {
        readFile.mockResolvedValue(
            JSON.stringify({ name: "  Acme  ", email: "info@acme.it", address: "  Via Roma 1  ", phone: "0123456" })
        );

        const state = await getCompanySettings();

        expect(state).toEqual({
            name: "Acme",
            email: "info@acme.it",
            address: "Via Roma 1",
            phone: "0123456",
            timeZone: defaultCompanyState.timeZone,
        });
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("mette in cache lo stato letto: la seconda chiamata non rilegge il file", async () => {
        readFile.mockResolvedValue(JSON.stringify(defaultCompanyState));

        await getCompanySettings();
        await getCompanySettings();

        expect(readFile).toHaveBeenCalledTimes(1);
    });

    it("dopo invalidateCompanySettingsCache rilegge il file dal disco", async () => {
        readFile.mockResolvedValue(JSON.stringify(defaultCompanyState));

        await getCompanySettings();
        invalidateCompanySettingsCache();
        await getCompanySettings();

        expect(readFile).toHaveBeenCalledTimes(2);
    });

    it("un campo mancante nel file ricade sul suo default, non su una stringa vuota", async () => {
        readFile.mockResolvedValue(JSON.stringify({ name: "Acme" }));

        const state = await getCompanySettings();

        expect(state).toEqual({ ...defaultCompanyState, name: "Acme" });
    });

    it("legge il fuso salvato, lo scrive nel nome canonico e lo fa adottare al processo", async () => {
        readFile.mockResolvedValue(JSON.stringify({ ...defaultCompanyState, timeZone: "america/new_york" }));

        const state = await getCompanySettings();

        expect(state.timeZone).toBe("America/New_York");
        expect(process.env.TZ).toBe("America/New_York");
        expect(await getAppTimeZone()).toBe("America/New_York");
    });

    it("un fuso che non esiste nel file ricade sul default invece di rompere le date", async () => {
        readFile.mockResolvedValue(JSON.stringify({ ...defaultCompanyState, timeZone: "Europa/Nessuna" }));

        expect((await getCompanySettings()).timeZone).toBe(defaultCompanyState.timeZone);
    });
});

describe("updateCompanySettings", () => {
    it("rifiuta un nome vuoto e non scrive nulla su disco", async () => {
        await expect(
            updateCompanySettings({ name: "   ", email: "a@b.it", address: "Via X", phone: "123" })
        ).rejects.toMatchObject({ statusCode: 400 });

        expect(writeFile).not.toHaveBeenCalled();
        expect(CompanyManagerError.prototype).toBeInstanceOf(Error);
    });

    it("sanifica e salva lo stato, aggiornando anche la cache in memoria", async () => {
        readFile.mockResolvedValue(JSON.stringify(defaultCompanyState));

        const result = await updateCompanySettings({
            name: "  Acme  ",
            email: "",
            address: "  Via X  ",
            phone: " 123 ",
        });

        // email vuota resta vuota: a differenza del nome, non ha un fallback sul default.
        // Senza fuso nell'input resta quello salvato.
        expect(result).toEqual({
            name: "Acme",
            email: "",
            address: "Via X",
            phone: "123",
            timeZone: defaultCompanyState.timeZone,
        });
        expect(writeFile).toHaveBeenCalledTimes(1);

        readFile.mockClear();
        const state = await getCompanySettings();

        expect(state).toEqual(result);
        expect(readFile).not.toHaveBeenCalled();
    });

    it("salva il fuso scelto e lo fa adottare subito al processo", async () => {
        readFile.mockResolvedValue(JSON.stringify(defaultCompanyState));

        const result = await updateCompanySettings({
            name: "Acme",
            email: "",
            address: "",
            phone: "",
            timeZone: "Asia/Tokyo",
        });

        expect(result.timeZone).toBe("Asia/Tokyo");
        expect(process.env.TZ).toBe("Asia/Tokyo");
        expect(writeFile).toHaveBeenCalledWith(
            expect.stringContaining("company-settings.json"),
            expect.stringContaining('"timeZone": "Asia/Tokyo"'),
            "utf-8"
        );
    });

    it("rifiuta un fuso inesistente senza scrivere nulla", async () => {
        readFile.mockResolvedValue(JSON.stringify(defaultCompanyState));

        await expect(
            updateCompanySettings({ name: "Acme", email: "", address: "", phone: "", timeZone: "Marte/Olympus" })
        ).rejects.toThrow("Fuso orario non riconosciuto");
        expect(writeFile).not.toHaveBeenCalled();
    });
});

describe("canonicalTimeZone", () => {
    it("restituisce il nome canonico di un fuso valido e null per uno inventato", () => {
        expect(canonicalTimeZone(" europe/rome ")).toBe("Europe/Rome");
        expect(canonicalTimeZone("UTC")).toBe("UTC");
        expect(canonicalTimeZone("Europa/Roma")).toBeNull();
        expect(canonicalTimeZone("")).toBeNull();
    });
});
