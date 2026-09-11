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

    // L'SVG e vettoriale, va servito cosi com'e: passarlo per sharp lo rasterizzerebbe.
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
