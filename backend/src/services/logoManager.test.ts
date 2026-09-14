import { beforeEach, describe, expect, it, vi } from "vitest";

const mkdir = vi.fn();
const writeFile = vi.fn();
const readFile = vi.fn();
const readdir = vi.fn();
const unlink = vi.fn();
const access = vi.fn();

vi.mock("node:fs", () => {
    const promises = {
        mkdir: (...args: unknown[]) => mkdir(...args),
        writeFile: (...args: unknown[]) => writeFile(...args),
        readFile: (...args: unknown[]) => readFile(...args),
        readdir: (...args: unknown[]) => readdir(...args),
        unlink: (...args: unknown[]) => unlink(...args),
        access: (...args: unknown[]) => access(...args),
    };
    return { default: { promises }, promises };
});

// sharp è l'unica dipendenza che processa davvero i byte dell'immagine: viene sostituita
// da una catena finta, così il test non elabora mai un'immagine reale.
const sharpResize = vi.fn();
const sharpPng = vi.fn();
const sharpToBuffer = vi.fn();
const sharpMetadata = vi.fn();
const sharpChain = {
    resize: (...args: unknown[]) => {
        sharpResize(...args);
        return sharpChain;
    },
    png: () => {
        sharpPng();
        return sharpChain;
    },
    toBuffer: () => sharpToBuffer(),
    metadata: () => sharpMetadata(),
};
const sharpFactory = vi.fn((..._args: unknown[]) => sharpChain);

vi.mock("sharp", () => ({
    default: (...args: unknown[]) => sharpFactory(...args),
}));

import { LogoManagerError, getLogoFile, getLogoStatus, loadPrintableLogo, resetLogo, saveLogo } from "./logoManager";

const svgMeta = JSON.stringify({
    fileName: "logo.svg",
    mimeType: "image/svg+xml",
    updatedAt: "2026-01-01T00:00:00.000Z",
});
const pngMeta = JSON.stringify({ fileName: "logo.png", mimeType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" });

/** `readFile` serve sia per `meta.json` sia per il file del logo: risponde in base al percorso. */
const mockLogoFiles = (meta: string | null, logoContent: Buffer) => {
    readFile.mockImplementation(async (filePath: string) => {
        if (filePath.endsWith("meta.json")) {
            if (meta === null) {
                throw new Error("ENOENT");
            }
            return meta;
        }
        return logoContent;
    });
    access.mockResolvedValue(undefined);
};

beforeEach(() => {
    vi.clearAllMocks();
    mkdir.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);
    readdir.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    unlink.mockResolvedValue(undefined);
    sharpToBuffer.mockResolvedValue(Buffer.from("png-ridimensionato"));
});

describe("getLogoStatus", () => {
    it("nessun logo personalizzato: hasCustomLogo false", async () => {
        readFile.mockRejectedValue(new Error("ENOENT"));

        await expect(getLogoStatus()).resolves.toEqual({ hasCustomLogo: false, updatedAt: null });
    });

    it("logo personalizzato presente: riporta la data di aggiornamento salvata", async () => {
        readFile.mockResolvedValue(
            JSON.stringify({ fileName: "logo.png", mimeType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" })
        );

        await expect(getLogoStatus()).resolves.toEqual({
            hasCustomLogo: true,
            updatedAt: "2026-01-01T00:00:00.000Z",
        });
    });
});

describe("getLogoFile", () => {
    it("senza metadati ripiega sul logo di default", async () => {
        readFile.mockRejectedValue(new Error("ENOENT"));

        const result = await getLogoFile();

        expect(result.mimeType).toBe("image/png");
        expect(result.filePath).toMatch(/logo-placeholder\.png$/);
    });

    it("con metadati ma file mancante sul disco ripiega comunque sul default", async () => {
        readFile.mockResolvedValue(
            JSON.stringify({ fileName: "logo.png", mimeType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" })
        );
        access.mockRejectedValue(new Error("ENOENT"));

        const result = await getLogoFile();

        expect(result.filePath).toMatch(/logo-placeholder\.png$/);
    });

    it("con metadati e file presente restituisce il logo personalizzato", async () => {
        readFile.mockResolvedValue(
            JSON.stringify({ fileName: "logo.svg", mimeType: "image/svg+xml", updatedAt: "2026-01-01T00:00:00.000Z" })
        );
        access.mockResolvedValue(undefined);

        const result = await getLogoFile();

        expect(result.mimeType).toBe("image/svg+xml");
        expect(result.filePath).toMatch(/logo\.svg$/);
    });

    /**
     * `meta.json` arriva anche da un archivio di backup ripristinato, quindi può essere
     * scritto da chiunque abbia preparato l'archivio. /assets/logo.jpg è pubblico: un nome
     * di file preso alla lettera avrebbe servito a chiunque la chiave di cifratura.
     */
    it("ignora un nome di file che esce dalla cartella del logo e ripiega sul default", async () => {
        readFile.mockResolvedValue(
            JSON.stringify({ fileName: "../secret.key", mimeType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" })
        );
        access.mockResolvedValue(undefined);

        const result = await getLogoFile();

        expect(result.filePath).toMatch(/logo-placeholder\.png$/);
        expect(access).not.toHaveBeenCalled();
    });

    it("serve il logo con il tipo deciso dal nome del file, non da quello scritto nei metadati", async () => {
        readFile.mockResolvedValue(
            JSON.stringify({ fileName: "logo.png", mimeType: "text/html", updatedAt: "2026-01-01T00:00:00.000Z" })
        );
        access.mockResolvedValue(undefined);

        const result = await getLogoFile();

        expect(result.mimeType).toBe("image/png");
        expect(result.filePath).toMatch(/logo\.png$/);
    });
});

describe("loadPrintableLogo", () => {
    it("un logo PNG viene letto dal disco così com'è, senza passare da sharp", async () => {
        const png = Buffer.from("png-bytes");
        mockLogoFiles(pngMeta, png);

        await expect(loadPrintableLogo()).resolves.toEqual({ content: png, contentType: "image/png" });
        expect(sharpFactory).not.toHaveBeenCalled();
    });

    it("senza logo personalizzato restituisce il segnaposto", async () => {
        const placeholder = Buffer.from("segnaposto");
        mockLogoFiles(null, placeholder);

        await expect(loadPrintableLogo()).resolves.toEqual({ content: placeholder, contentType: "image/png" });
        expect(readFile).toHaveBeenCalledWith(expect.stringMatching(/logo-placeholder\.png$/));
    });

    // pdfkit accetta solo JPEG e PNG: un SVG passato così com'è faceva fallire l'intera stampa.
    it("un logo SVG viene rasterizzato in PNG alla densità che lo porta a 512px", async () => {
        const svg = Buffer.from('<svg width="44" height="22"></svg>');
        mockLogoFiles(svgMeta, svg);
        sharpMetadata.mockResolvedValue({ width: 44, height: 22 });

        const logo = await loadPrintableLogo();

        expect(sharpFactory).toHaveBeenLastCalledWith(svg, { density: (72 * 512) / 44 });
        expect(sharpResize).toHaveBeenCalledWith(512, 512, { fit: "inside", withoutEnlargement: true });
        expect(logo).toEqual({ content: Buffer.from("png-ridimensionato"), contentType: "image/png" });
    });

    it("un SVG senza dimensioni dichiarate viene reso alla densità di default", async () => {
        const svg = Buffer.from('<svg viewBox="0 0 10 10"></svg>');
        mockLogoFiles(svgMeta, svg);
        sharpMetadata.mockResolvedValue({});

        await loadPrintableLogo();

        expect(sharpFactory).toHaveBeenLastCalledWith(svg, { density: 72 });
    });

    it("se il logo non si legge restituisce null, così la stampa esce comunque", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        mockLogoFiles(svgMeta, Buffer.from("<svg></svg>"));
        sharpMetadata.mockRejectedValue(new Error("SVG non valido"));

        await expect(loadPrintableLogo()).resolves.toBeNull();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});

describe("saveLogo", () => {
    it("rifiuta un formato non supportato", async () => {
        await expect(saveLogo(Buffer.from("x"), "application/pdf")).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(LogoManagerError.prototype).toBeInstanceOf(Error);
        expect(mkdir).not.toHaveBeenCalled();
    });

    it("rifiuta un file vuoto", async () => {
        await expect(saveLogo(Buffer.alloc(0), "image/png")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rifiuta un file oltre i 5 MB", async () => {
        const troppoGrande = Buffer.alloc(5 * 1024 * 1024 + 1);

        await expect(saveLogo(troppoGrande, "image/png")).rejects.toMatchObject({ statusCode: 400 });
    });

    // L'SVG è vettoriale: passarlo per sharp lo rasterizzerebbe, quindi va scritto così com'è.
    it("un SVG viene salvato invariato, senza passare da sharp", async () => {
        const buffer = Buffer.from("<svg></svg>");

        const status = await saveLogo(buffer, "image/svg+xml");

        expect(sharpFactory).not.toHaveBeenCalled();
        expect(writeFile).toHaveBeenCalledWith(expect.stringMatching(/logo\.svg$/), buffer);
        expect(status.hasCustomLogo).toBe(true);
    });

    it("un raster viene ridimensionato e convertito in PNG tramite sharp", async () => {
        const buffer = Buffer.from("finto-jpeg");

        await saveLogo(buffer, "image/jpeg");

        expect(sharpFactory).toHaveBeenCalledWith(buffer);
        expect(sharpResize).toHaveBeenCalledWith(512, 512, { fit: "inside", withoutEnlargement: true });
        expect(sharpPng).toHaveBeenCalled();
        expect(writeFile).toHaveBeenCalledWith(expect.stringMatching(/logo\.png$/), Buffer.from("png-ridimensionato"));
        // Il mimeType salvato è sempre image/png per i raster, a prescindere dal formato in ingresso.
        expect(writeFile).toHaveBeenCalledWith(
            expect.stringMatching(/meta\.json$/),
            expect.stringContaining("image/png"),
            "utf-8"
        );
    });

    it("svuota la cartella del logo prima di scrivere il nuovo file", async () => {
        readdir.mockResolvedValue(["vecchio.png", "meta.json"]);

        await saveLogo(Buffer.from("x"), "image/png");

        expect(unlink).toHaveBeenCalledTimes(2);
    });

    it("una cartella logo ancora assente non fa fallire il salvataggio", async () => {
        readdir.mockRejectedValue(new Error("ENOENT"));

        await expect(saveLogo(Buffer.from("x"), "image/png")).resolves.toMatchObject({ hasCustomLogo: true });
    });
});

describe("resetLogo", () => {
    it("rimuove i file della cartella logo e torna allo stato di default", async () => {
        readdir.mockResolvedValue(["logo.png", "meta.json"]);
        readFile.mockRejectedValue(new Error("ENOENT"));

        const status = await resetLogo();

        expect(unlink).toHaveBeenCalledTimes(2);
        expect(status).toEqual({ hasCustomLogo: false, updatedAt: null });
    });
});
