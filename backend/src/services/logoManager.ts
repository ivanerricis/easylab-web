import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ApiError } from "./apiError";

const dataDir = path.join(process.cwd(), "data");
const logoDir = path.join(dataDir, "logo");
const metaFilePath = path.join(logoDir, "meta.json");
const defaultLogoPath = path.join(process.cwd(), "public", "logo-placeholder.png");
const maxLogoSizeBytes = 5 * 1024 * 1024;
// I loghi caricati arrivano in qualsiasi risoluzione/formato/compressione: senza normalizzarli
// un JPEG lossy di pochi KB finisce mostrato a 32px in sidebar e sembra pixellato. Convertiamo
// tutto in PNG (lossless) e limitiamo il lato massimo, senza mai ingrandire immagini piu piccole.
const maxLogoDimension = 512;

export class LogoManagerError extends ApiError {}

type LogoFormat = "png" | "jpeg" | "gif" | "webp" | "svg";

const hasBytesAt = (buffer: Buffer, bytes: number[], offset = 0) =>
    buffer.length >= offset + bytes.length && bytes.every((byte, index) => buffer[offset + index] === byte);

const looksLikeSvg = (buffer: Buffer) => {
    if (buffer.includes(0)) {
        return false;
    }

    const text = buffer
        .toString("utf-8")
        .replace(/^\uFEFF/, "")
        .trimStart();
    return text.startsWith("<") && /<svg[\s/>]/i.test(text);
};

/**
 * Il formato si riconosce dai byte, non dal tipo dichiarato nell'upload: quello lo scrive chi
 * carica il file. Prima un file qualsiasi dichiarato `image/svg+xml` veniva salvato così
 * com'era, e uno SVG dichiarato `image/png` finiva a librsvg attraverso sharp.
 *
 * Per l'SVG questo è solo un filtro grossolano: la verifica vera è che librsvg riesca a
 * renderizzarlo, fatta in `saveLogo`.
 */
const detectLogoFormat = (buffer: Buffer): LogoFormat | null => {
    if (hasBytesAt(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return "png";
    }

    if (hasBytesAt(buffer, [0xff, 0xd8, 0xff])) {
        return "jpeg";
    }

    const header = buffer.subarray(0, 12).toString("latin1");

    if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) {
        return "gif";
    }

    if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") {
        return "webp";
    }

    return looksLikeSvg(buffer) ? "svg" : null;
};

type LogoMeta = {
    fileName: string;
    mimeType: string;
    updatedAt: string;
};

const readMeta = async (): Promise<LogoMeta | null> => {
    try {
        const raw = await fs.promises.readFile(metaFilePath, "utf-8");
        return JSON.parse(raw) as LogoMeta;
    } catch {
        return null;
    }
};

const clearLogoDir = async () => {
    try {
        const entries = await fs.promises.readdir(logoDir);
        await Promise.all(entries.map((name) => fs.promises.unlink(path.join(logoDir, name)).catch(() => {})));
    } catch {
        // La cartella potrebbe non esistere ancora, nessun logo personalizzato da rimuovere.
    }
};

export const getLogoStatus = async () => {
    const meta = await readMeta();

    if (!meta) {
        return { hasCustomLogo: false, updatedAt: null as string | null };
    }

    return { hasCustomLogo: true, updatedAt: meta.updatedAt };
};

/**
 * Gli unici file che `saveLogo` scrive, con il tipo con cui vanno serviti.
 *
 * `meta.json` non è un dato di cui fidarsi: un ripristino da archivio lo sostituisce con
 * quello contenuto nell'archivio. Usarne `fileName` così com'è permetteva a un archivio
 * preparato apposta (`"fileName": "../secret.key"`) di far servire qualunque file del
 * container su /assets/logo.jpg, che è pubblico perché serve alla pagina di login. Anche il
 * tipo si prende da qui e non dai metadati: un tipo a scelta sarebbe un modo per far
 * interpretare il file al browser come qualcos'altro.
 */
const storedLogoMimeTypes: Record<string, string> = {
    "logo.png": "image/png",
    "logo.svg": "image/svg+xml",
};

export const getLogoFile = async (): Promise<{ filePath: string; mimeType: string }> => {
    const meta = await readMeta();
    const mimeType =
        meta && Object.hasOwn(storedLogoMimeTypes, meta.fileName) ? storedLogoMimeTypes[meta.fileName] : null;

    if (meta && mimeType) {
        const filePath = path.join(logoDir, meta.fileName);

        try {
            await fs.promises.access(filePath);
            return { filePath, mimeType };
        } catch {
            // Il file referenziato nei metadati non esiste piu, uso il logo di default.
        }
    }

    return { filePath: defaultLogoPath, mimeType: "image/png" };
};

// Limiti del parametro `density` di sharp.
const minSvgDensity = 1;
const maxSvgDensity = 100_000;
const defaultSvgDensity = 72;

/**
 * La densità va calcolata sulle dimensioni dichiarate: sharp renderizza un SVG a 72 dpi, e
 * un logo esportato con `width="44"` diventerebbe un PNG di 44px, sgranato nel PDF. Così
 * esce già a `maxLogoDimension` sul lato lungo, senza ingrandire un raster.
 */
const rasterizeSvg = async (svg: Buffer): Promise<Buffer> => {
    const { width, height } = await sharp(svg).metadata();
    const longestSide = Math.max(width ?? 0, height ?? 0);
    const density =
        longestSide > 0
            ? Math.min(Math.max((defaultSvgDensity * maxLogoDimension) / longestSide, minSvgDensity), maxSvgDensity)
            : defaultSvgDensity;

    return sharp(svg, { density })
        .resize(maxLogoDimension, maxLogoDimension, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
};

export type PrintableLogo = { content: Buffer; contentType: "image/png" };

/**
 * Il logo per PDF ed email, sempre PNG: pdfkit accetta solo JPEG e PNG (un SVG faceva
 * fallire l'intera stampa con "Unknown image format"), e molti client di posta, Gmail per
 * primo, non mostrano gli SVG. Nell'app l'SVG resta invece vettoriale.
 *
 * Si legge dal disco e non da /assets/logo.jpg via HTTP: l'URL veniva composto dall'header
 * `Host` della richiesta, quindi chi chiedeva un PDF decideva quale host il backend avrebbe
 * contattato, e riceveva la risposta incorporata nel PDF.
 */
const loadPrintableLogoUncached = async (): Promise<PrintableLogo | null> => {
    try {
        const { filePath, mimeType } = await getLogoFile();
        const content = await fs.promises.readFile(filePath);

        return {
            content: mimeType === "image/svg+xml" ? await rasterizeSvg(content) : content,
            contentType: "image/png",
        };
    } catch (error) {
        // Una stampa senza logo è meglio di una stampa che non esce.
        console.error("Logo non disponibile per la stampa:", error);
        return null;
    }
};

// Cache della promise (non solo del valore risolto): la stessa stampa PDF chiama questa
// funzione più volte in parallelo (vedi `createInterventionPdfBuffer`/`loadLogoDataUrl`), e
// cachare solo il valore risolto non evitrebbe la doppia lettura/rasterizzazione tra chiamate
// concorrenti che partono prima che la prima si sia risolta.
let cachedLogo: Promise<PrintableLogo | null> | null = null;

export const loadPrintableLogo = (): Promise<PrintableLogo | null> => {
    if (!cachedLogo) {
        cachedLogo = loadPrintableLogoUncached();
    }
    return cachedLogo;
};

/** Solo per i test: la cache altrimenti sopravvivrebbe fra un `it()` e l'altro dello stesso file. */
export const __resetLogoCacheForTests = () => {
    cachedLogo = null;
};

/**
 * L'SVG è vettoriale e nell'app va servito così com'è. Lo si rasterizza comunque una volta,
 * scartando il risultato: un SVG che librsvg non sa rendere sparirebbe in silenzio da PDF ed
 * email, e qui l'admin lo scopre subito.
 */
const prepareLogoFile = async (buffer: Buffer, format: LogoFormat) => {
    if (format === "svg") {
        await rasterizeSvg(buffer);
        return { fileName: "logo.svg", mimeType: "image/svg+xml", content: buffer };
    }

    const content = await sharp(buffer)
        .resize(maxLogoDimension, maxLogoDimension, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();

    return { fileName: "logo.png", mimeType: "image/png", content };
};

export const saveLogo = async (buffer: Buffer) => {
    if (buffer.byteLength === 0) {
        throw new LogoManagerError("Il file caricato è vuoto", 400);
    }

    if (buffer.byteLength > maxLogoSizeBytes) {
        throw new LogoManagerError("Il file supera la dimensione massima di 5 MB", 400);
    }

    const format = detectLogoFormat(buffer);

    if (!format) {
        throw new LogoManagerError("Formato immagine non supportato. Usa JPG, PNG, WEBP, GIF o SVG.", 400);
    }

    // Il file va elaborato prima di svuotare la cartella: prima un upload che sharp non
    // riusciva a leggere cancellava il logo esistente e lasciava l'app senza.
    const { fileName, mimeType, content } = await prepareLogoFile(buffer, format).catch(() => {
        throw new LogoManagerError("L'immagine non è leggibile: il file potrebbe essere danneggiato.", 400);
    });

    await fs.promises.mkdir(logoDir, { recursive: true });
    await clearLogoDir();
    await fs.promises.writeFile(path.join(logoDir, fileName), content);

    const meta: LogoMeta = {
        fileName,
        mimeType,
        updatedAt: new Date().toISOString(),
    };

    await fs.promises.writeFile(metaFilePath, `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
    cachedLogo = null;

    return getLogoStatus();
};

export const resetLogo = async () => {
    await clearLogoDir();
    cachedLogo = null;
    return getLogoStatus();
};
