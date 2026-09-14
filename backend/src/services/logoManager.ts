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

const allowedMimeTypes: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
};

export class LogoManagerError extends ApiError {}

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
export const loadPrintableLogo = async (): Promise<PrintableLogo | null> => {
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

export const saveLogo = async (buffer: Buffer, mimeType: string) => {
    const extension = allowedMimeTypes[mimeType];

    if (!extension) {
        throw new LogoManagerError("Formato immagine non supportato. Usa JPG, PNG, WEBP, GIF o SVG.", 400);
    }

    if (buffer.byteLength === 0) {
        throw new LogoManagerError("Il file caricato e vuoto", 400);
    }

    if (buffer.byteLength > maxLogoSizeBytes) {
        throw new LogoManagerError("Il file supera la dimensione massima di 5 MB", 400);
    }

    await fs.promises.mkdir(logoDir, { recursive: true });
    await clearLogoDir();

    // L'SVG è vettoriale e nell'app va servito così com'è: lo rasterizza solo
    // `loadPrintableLogo`, per PDF ed email.
    const isVector = mimeType === "image/svg+xml";
    const fileName = isVector ? `logo.${extension}` : "logo.png";
    const outputMimeType = isVector ? mimeType : "image/png";
    const outputBuffer = isVector
        ? buffer
        : await sharp(buffer)
              .resize(maxLogoDimension, maxLogoDimension, { fit: "inside", withoutEnlargement: true })
              .png()
              .toBuffer();

    await fs.promises.writeFile(path.join(logoDir, fileName), outputBuffer);

    const meta: LogoMeta = {
        fileName,
        mimeType: outputMimeType,
        updatedAt: new Date().toISOString(),
    };

    await fs.promises.writeFile(metaFilePath, `${JSON.stringify(meta, null, 2)}\n`, "utf-8");

    return getLogoStatus();
};

export const resetLogo = async () => {
    await clearLogoDir();
    return getLogoStatus();
};
