/**
 * Cifratura/decifratura dell'archivio di backup (db-backup-*.tar.gz). Nome ed estensione
 * restano quelli di sempre - non cambia niente per retention, upload SMB o download -
 * cambia solo il contenuto del file, che passa da gzip in chiaro a questo contenitore:
 *
 *   [4 byte magic "MWB1"] [12 byte IV] [dati cifrati] [16 byte auth tag GCM]
 *
 * Tutto in streaming, mai l'intero file in RAM: un dump di centinaia di MB non deve
 * diventare un problema di memoria. L'auth tag di GCM è disponibile solo a cifratura
 * conclusa, quindi va scritto in coda invece che in testa; in decifratura lo si legge per
 * primo con una lettura posizionale, cosi da poterlo passare a `setAuthTag` prima di
 * leggere in streaming il resto del file.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import { BackupManagerError } from "./backupError";
import { getOrCreateBackupKey } from "./backupKey";

const algorithm = "aes-256-gcm";
const ivLength = 12;
const tagLength = 16;
const magic = Buffer.from("MWB1", "ascii");
const headerLength = magic.length + ivLength;

/** Un'archivio cifrato con la chiave sbagliata o corrotto: il chiamante sa se contestualizzare
 * il messaggio (es. "hai incollato la chiave giusta?") in base a come è stata invocata la
 * decifratura, quindi qui resta un errore distinto invece di un BackupManagerError già scritto. */
export class BackupDecryptAuthError extends Error {
    constructor() {
        super("Impossibile decifrare l'archivio: chiave di backup errata o file corrotto");
    }
}

export const isEncryptedArchiveFile = async (filePath: string): Promise<boolean> => {
    const fh = await fs.promises.open(filePath, "r");

    try {
        const header = Buffer.alloc(magic.length);
        const { bytesRead } = await fh.read(header, 0, magic.length, 0);

        return bytesRead === magic.length && header.equals(magic);
    } finally {
        await fh.close();
    }
};

export const encryptArchiveFile = async (sourcePath: string, destPath: string): Promise<void> => {
    const key = await getOrCreateBackupKey();
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const dest = fs.createWriteStream(destPath);

    await new Promise<void>((resolve, reject) => {
        dest.on("error", reject);
        dest.write(Buffer.concat([magic, iv]), (error) => (error ? reject(error) : resolve()));
    });

    // Non si può passare `dest` direttamente come ultimo stadio di `pipeline`: chiuderebbe
    // il file non appena i dati cifrati finiscono, impedendo di appendere l'auth tag dopo.
    const forwardToDest = new Writable({
        write(chunk: Buffer, _encoding, callback) {
            dest.write(chunk, callback);
        },
    });

    await pipeline(fs.createReadStream(sourcePath), cipher, forwardToDest);

    // Il tipo di `end()` dichiara una callback senza argomenti (a differenza di `write()`):
    // un eventuale errore di scrittura dell'auth tag va quindi intercettato dall'evento
    // "error", non dal parametro della callback.
    await new Promise<void>((resolve, reject) => {
        dest.once("error", reject);
        dest.end(cipher.getAuthTag(), () => resolve());
    });
};

export const decryptArchiveFile = async (sourcePath: string, destPath: string, keyOverride?: Buffer) => {
    const key = keyOverride ?? (await getOrCreateBackupKey());
    const { size } = await fs.promises.stat(sourcePath);

    if (size < headerLength + tagLength) {
        throw new BackupManagerError("Archivio cifrato non valido o corrotto", 400);
    }

    const fh = await fs.promises.open(sourcePath, "r");

    try {
        const header = Buffer.alloc(headerLength);
        await fh.read(header, 0, headerLength, 0);

        if (!header.subarray(0, magic.length).equals(magic)) {
            throw new BackupManagerError("Archivio cifrato non valido o corrotto", 400);
        }

        const iv = header.subarray(magic.length);

        const tag = Buffer.alloc(tagLength);
        await fh.read(tag, 0, tagLength, size - tagLength);

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAuthTag(tag);

        const source = fs.createReadStream(sourcePath, {
            fd: fh.fd,
            autoClose: false,
            start: headerLength,
            end: size - tagLength - 1,
        });

        try {
            await pipeline(source, decipher, fs.createWriteStream(destPath));
        } catch (error) {
            if (error instanceof BackupManagerError) {
                throw error;
            }

            // GCM rifiuta in `final()` un auth tag che non torna: è il caso normale di
            // chiave sbagliata o file manomesso, non un errore di I/O da propagare cosi com'è.
            throw new BackupDecryptAuthError();
        }
    } finally {
        await fh.close();
    }
};
