/**
 * Chiave dedicata alla cifratura dell'archivio di backup (data/backup.key), separata da
 * data/secret.key: quest'ultima cifra le password salvate nelle impostazioni e non deve
 * mai lasciare il server; questa invece è pensata per essere esportata dall'amministratore
 * e conservata altrove (password manager, cassaforte). Senza una copia esterna, un
 * disastro che porta via server e disco insieme renderebbe illeggibile anche l'ultimo
 * backup rimasto sul NAS - esattamente il caso in cui servirebbe di più.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BackupManagerError } from "./backupError";

const keyDir = path.join(process.cwd(), "data");
const keyFilePath = path.join(keyDir, "backup.key");
export const backupKeyLength = 32;

let cachedKey: Buffer | null = null;

export const getOrCreateBackupKey = async (): Promise<Buffer> => {
    if (cachedKey) {
        return cachedKey;
    }

    // Solo l'assenza del file porta a generarne una nuova, come in `secretCrypto.ts`. Prima
    // qualunque errore di lettura rigenerava la chiave scrivendoci sopra: i backup successivi
    // uscivano cifrati con una chiave mai esportata, e la copia custodita dall'admin smetteva
    // di aprirli senza che nessuno se ne accorgesse.
    let raw: string | null = null;

    try {
        raw = await fs.promises.readFile(keyFilePath, "utf-8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
        }
    }

    if (raw !== null) {
        const key = Buffer.from(raw.trim(), "hex");

        if (key.length !== backupKeyLength) {
            throw new BackupManagerError(
                "data/backup.key non contiene una chiave valida: il file non è stato sovrascritto",
                500
            );
        }

        cachedKey = key;
        return cachedKey;
    }

    const key = crypto.randomBytes(backupKeyLength);
    await fs.promises.mkdir(keyDir, { recursive: true });
    // `wx`: se nel frattempo il file è comparso, meglio fallire che scrivergli sopra.
    await fs.promises.writeFile(keyFilePath, `${key.toString("hex")}\n`, {
        encoding: "utf-8",
        mode: 0o600,
        flag: "wx",
    });
    cachedKey = key;

    return cachedKey;
};

export const exportBackupKey = async (): Promise<string> => (await getOrCreateBackupKey()).toString("hex");

/**
 * Decodifica una chiave incollata a mano nel form di ripristino (esportata in precedenza
 * da un altro server). Un formato palesemente sbagliato viene rifiutato subito, prima di
 * arrivare al tentativo di decifratura.
 */
export const decodeBackupKeyOverride = (hex: string): Buffer => {
    const key = Buffer.from(hex.trim(), "hex");

    if (key.length !== backupKeyLength) {
        throw new BackupManagerError("Chiave di backup non valida", 400);
    }

    return key;
};

/**
 * Sostituisce la chiave locale con quella incollata al ripristino, una volta verificato
 * che decifra davvero l'archivio: da quel momento i prossimi backup su questa macchina
 * useranno la stessa chiave di quelli già esistenti sul NAS.
 */
export const setBackupKey = async (hex: string): Promise<void> => {
    const key = decodeBackupKeyOverride(hex);

    await fs.promises.mkdir(keyDir, { recursive: true });
    await fs.promises.writeFile(keyFilePath, `${key.toString("hex")}\n`, { encoding: "utf-8", mode: 0o600 });
    cachedKey = key;
};

export const invalidateBackupKeyCache = () => {
    cachedKey = null;
};
