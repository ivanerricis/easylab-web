import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const keyDir = path.join(process.cwd(), "data");
const keyFilePath = path.join(keyDir, "secret.key");
const algorithm = "aes-256-gcm";
const keyLength = 32;
const ivLength = 12;
// Fissato anche in decifratura: senza `authTagLength` Node accetta tag troncati fino a 4 byte,
// e un tag da 32 bit si falsifica per tentativi. I payload di questo modulo li scrive solo
// `encryptSecret`, sempre con 16 byte, quindi qualunque altra lunghezza è un payload manomesso.
const authTagLength = 16;

/**
 * La chiave su disco, oppure null se il file non esiste ancora.
 *
 * Solo l'assenza del file porta a generarne una nuova. Prima *qualunque* errore di lettura
 * (permessi, I/O, un file modificato a mano) finiva nello stesso ramo, e la chiave veniva
 * rigenerata e scritta sopra quella buona: tutti i segreti cifrati — password SMTP e NAS,
 * segreti della 2FA — diventavano illeggibili per sempre, per un intoppo magari di un istante.
 * Adesso un file presente ma inutilizzabile ferma tutto con un errore, e si può rimediare.
 */
const readKey = async (): Promise<Buffer | null> => {
    let raw: string;

    try {
        raw = await fs.promises.readFile(keyFilePath, "utf-8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }

        throw error;
    }

    const key = Buffer.from(raw.trim(), "hex");

    if (key.length !== keyLength) {
        throw new Error(`${keyFilePath} non contiene una chiave valida: il file non è stato sovrascritto`);
    }

    return key;
};

const readOrCreateKey = async (): Promise<Buffer> => {
    const existing = await readKey();

    if (existing) {
        return existing;
    }

    const key = crypto.randomBytes(keyLength);
    await fs.promises.mkdir(keyDir, { recursive: true });
    // `wx`: se nel frattempo il file è comparso, meglio fallire che scrivergli sopra.
    await fs.promises.writeFile(keyFilePath, `${key.toString("hex")}\n`, {
        encoding: "utf-8",
        mode: 0o600,
        flag: "wx",
    });

    return key;
};

// La promessa, non la chiave: due cifrature concorrenti al primo avvio devono condividere la
// stessa generazione, invece di scrivere due chiavi diverse. Su un errore si azzera, così la
// chiamata successiva riprova invece di restituire per sempre lo stesso fallimento.
let keyPromise: Promise<Buffer> | null = null;

const loadOrCreateKey = (): Promise<Buffer> => {
    keyPromise ??= readOrCreateKey().catch((error: unknown) => {
        keyPromise = null;
        throw error;
    });

    return keyPromise;
};

export const encryptSecret = async (plainText: string): Promise<string> => {
    const key = await loadOrCreateKey();
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, key, iv, { authTagLength });
    const encrypted = Buffer.concat([cipher.update(plainText, "utf-8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
};

export const decryptSecret = async (payload: string): Promise<string> => {
    const [ivHex, authTagHex, dataHex] = payload.split(":");

    if (!ivHex || !authTagHex || !dataHex) {
        throw new Error("Formato del segreto cifrato non valido");
    }

    const authTag = Buffer.from(authTagHex, "hex");

    if (authTag.length !== authTagLength) {
        throw new Error("Formato del segreto cifrato non valido");
    }

    const key = await loadOrCreateKey();
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivHex, "hex"), { authTagLength });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);

    return decrypted.toString("utf-8");
};
