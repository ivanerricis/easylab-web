import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type KeyFileOptions = {
    fileName: string;
    length: number;
    /** L'errore per un file presente ma inutilizzabile: ogni chiave ha il suo tipo e il suo stato HTTP. */
    invalidKeyError: (filePath: string) => Error;
};

/**
 * Una chiave casuale in `data/`, letta una volta e generata al primo uso.
 *
 * Serve a `secretCrypto` (segreti delle impostazioni) e a `backupKey` (archivi di backup), che
 * avevano due copie della stessa logica: la correzione EL-03 era andata fatta due volte, e la copia
 * dei backup aveva perso la promessa condivisa, quindi due chiamate concorrenti al primo avvio
 * facevano fallire la seconda sul `wx`.
 *
 * Solo l'assenza del file porta a generarne una nuova. Prima *qualunque* errore di lettura
 * (permessi, I/O, un file modificato a mano) finiva nello stesso ramo, e la chiave veniva
 * rigenerata e scritta sopra quella buona: tutto ciò che era cifrato con lei diventava
 * illeggibile per sempre, per un intoppo magari di un istante. Adesso un file presente ma
 * inutilizzabile ferma tutto con un errore, e si può rimediare.
 */
export const createKeyFile = ({ fileName, length, invalidKeyError }: KeyFileOptions) => {
    const keyDir = path.join(process.cwd(), "data");
    const filePath = path.join(keyDir, fileName);

    const readKey = async (): Promise<Buffer | null> => {
        let raw: string;

        try {
            raw = await fs.promises.readFile(filePath, "utf-8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return null;
            }

            throw error;
        }

        const key = Buffer.from(raw.trim(), "hex");

        if (key.length !== length) {
            throw invalidKeyError(filePath);
        }

        return key;
    };

    const readOrCreateKey = async (): Promise<Buffer> => {
        const existing = await readKey();

        if (existing) {
            return existing;
        }

        const key = crypto.randomBytes(length);
        await fs.promises.mkdir(keyDir, { recursive: true });
        // `wx`: se nel frattempo il file è comparso, meglio fallire che scrivergli sopra.
        await fs.promises.writeFile(filePath, `${key.toString("hex")}\n`, {
            encoding: "utf-8",
            mode: 0o600,
            flag: "wx",
        });

        return key;
    };

    // La promessa, non la chiave: due chiamate concorrenti al primo avvio devono condividere la
    // stessa generazione, invece di scrivere due chiavi diverse. Su un errore si azzera, così la
    // chiamata successiva riprova invece di restituire per sempre lo stesso fallimento.
    let keyPromise: Promise<Buffer> | null = null;

    return {
        load: (): Promise<Buffer> => {
            keyPromise ??= readOrCreateKey().catch((error: unknown) => {
                keyPromise = null;
                throw error;
            });

            return keyPromise;
        },
        /** Sostituisce la chiave su disco (senza `wx`: qui sovrascrivere è lo scopo). */
        replace: async (key: Buffer) => {
            await fs.promises.mkdir(keyDir, { recursive: true });
            await fs.promises.writeFile(filePath, `${key.toString("hex")}\n`, { encoding: "utf-8", mode: 0o600 });
            keyPromise = Promise.resolve(key);
        },
        invalidate: () => {
            keyPromise = null;
        },
    };
};
