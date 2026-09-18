import crypto from "node:crypto";
import { createKeyFile } from "./keyFile";

const algorithm = "aes-256-gcm";
const keyLength = 32;
const ivLength = 12;
// Fissato anche in decifratura: senza `authTagLength` Node accetta tag troncati fino a 4 byte,
// e un tag da 32 bit si falsifica per tentativi. I payload di questo modulo li scrive solo
// `encryptSecret`, sempre con 16 byte, quindi qualunque altra lunghezza è un payload manomesso.
const authTagLength = 16;

// data/secret.key: cifra le password SMTP e NAS e i segreti della 2FA. Vedi `keyFile.ts`.
const secretKey = createKeyFile({
    fileName: "secret.key",
    length: keyLength,
    invalidKeyError: (filePath) =>
        new Error(`${filePath} non contiene una chiave valida: il file non è stato sovrascritto`),
});

const loadOrCreateKey = secretKey.load;

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
