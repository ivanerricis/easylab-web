import { beforeEach, describe, expect, it, vi } from "vitest";

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
    CompanyManagerError,
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
};

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

        expect(state).toEqual({ name: "Acme", email: "info@acme.it", address: "Via Roma 1", phone: "0123456" });
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
        const result = await updateCompanySettings({
            name: "  Acme  ",
            email: "",
            address: "  Via X  ",
            phone: " 123 ",
        });

        // email vuota resta vuota: a differenza del nome, non ha un fallback sul default.
        expect(result).toEqual({ name: "Acme", email: "", address: "Via X", phone: "123" });
        expect(writeFile).toHaveBeenCalledTimes(1);

        readFile.mockClear();
        const state = await getCompanySettings();

        expect(state).toEqual(result);
        expect(readFile).not.toHaveBeenCalled();
    });
});
