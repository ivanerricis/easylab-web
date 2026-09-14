import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "./secretCrypto";

describe("secretCrypto", () => {
    it("decifra ciò che ha cifrato", async () => {
        const plainText = "password-smtp-di-prova";

        expect(await decryptSecret(await encryptSecret(plainText))).toBe(plainText);
    });

    it("produce un payload diverso a ogni cifratura (IV casuale)", async () => {
        const plainText = "stesso-valore";

        expect(await encryptSecret(plainText)).not.toBe(await encryptSecret(plainText));
    });

    it("rifiuta un payload malformato", async () => {
        await expect(decryptSecret("non-un-payload")).rejects.toThrow("Formato del segreto cifrato non valido");
    });

    it("rifiuta un payload manomesso (auth tag GCM)", async () => {
        const [iv, authTag, data] = (await encryptSecret("valore")).split(":");
        const tamperedData = data.startsWith("00") ? `11${data.slice(2)}` : `00${data.slice(2)}`;

        await expect(decryptSecret([iv, authTag, tamperedData].join(":"))).rejects.toThrow();
    });

    /** Senza `authTagLength` Node accetterebbe un tag di 4 byte: 32 bit si falsificano per tentativi. */
    it("rifiuta un payload con l'auth tag troncato", async () => {
        const [iv, authTag, data] = (await encryptSecret("valore")).split(":");

        await expect(decryptSecret([iv, authTag.slice(0, 8), data].join(":"))).rejects.toThrow(
            "Formato del segreto cifrato non valido"
        );
    });
});

/**
 * Il file della chiave con `node:fs` finto: il modulo tiene la chiave in memoria, quindi ogni
 * test lo reimporta da zero.
 */
describe("secretCrypto, file della chiave", () => {
    const keyFilePath = path.join(process.cwd(), "data", "secret.key");
    const validKeyHex = "ab".repeat(32);
    const readFile = vi.fn();
    const writeFile = vi.fn();
    const mkdir = vi.fn();

    const errno = (code: string) => Object.assign(new Error(code), { code });

    const loadModule = async () => {
        vi.resetModules();
        vi.doMock("node:fs", () => {
            const promises = { readFile, writeFile, mkdir };
            return { default: { promises }, promises };
        });
        return import("./secretCrypto.js");
    };

    beforeEach(() => {
        readFile.mockReset();
        writeFile.mockReset().mockResolvedValue(undefined);
        mkdir.mockReset().mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.doUnmock("node:fs");
        vi.resetModules();
    });

    it("genera la chiave solo se il file non esiste, senza poter scrivere sopra un file comparso nel frattempo", async () => {
        readFile.mockRejectedValue(errno("ENOENT"));
        const { encryptSecret: encrypt } = await loadModule();

        await encrypt("valore");

        expect(writeFile).toHaveBeenCalledOnce();
        expect(writeFile).toHaveBeenCalledWith(
            keyFilePath,
            expect.stringMatching(/^[0-9a-f]{64}\n$/),
            expect.objectContaining({ mode: 0o600, flag: "wx" })
        );
    });

    /**
     * Il buco che questo test chiude: prima ogni errore di lettura rigenerava la chiave
     * scrivendoci sopra, e tutti i segreti cifrati — 2FA compresa — diventavano illeggibili.
     */
    it("con un file presente ma illeggibile fallisce senza toccarlo", async () => {
        readFile.mockRejectedValue(errno("EACCES"));
        const { encryptSecret: encrypt } = await loadModule();

        await expect(encrypt("valore")).rejects.toThrow("EACCES");
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("con un file che non contiene una chiave valida fallisce senza toccarlo", async () => {
        readFile.mockResolvedValue("non-una-chiave\n");
        const { decryptSecret: decrypt } = await loadModule();

        await expect(decrypt("aa:bb:cc")).rejects.toThrow();
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("due cifrature al primo avvio condividono la stessa chiave generata", async () => {
        readFile.mockRejectedValue(errno("ENOENT"));
        const { encryptSecret: encrypt, decryptSecret: decrypt } = await loadModule();

        const [first, second] = await Promise.all([encrypt("uno"), encrypt("due")]);

        expect(writeFile).toHaveBeenCalledOnce();
        expect(await decrypt(first)).toBe("uno");
        expect(await decrypt(second)).toBe("due");
    });

    it("dopo un errore la chiamata successiva riprova a leggere", async () => {
        readFile.mockRejectedValueOnce(errno("EIO")).mockResolvedValue(`${validKeyHex}\n`);
        const { encryptSecret: encrypt } = await loadModule();

        await expect(encrypt("valore")).rejects.toThrow("EIO");
        await expect(encrypt("valore")).resolves.toMatch(/^[0-9a-f]+:[0-9a-f]{32}:[0-9a-f]+$/);
        expect(writeFile).not.toHaveBeenCalled();
    });
});
