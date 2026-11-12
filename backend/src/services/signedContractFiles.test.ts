import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSignedContractFile, removeSignedContractFile, stageSignedContractFile } from "./signedContractFiles";

// Su una cartella vera, temporanea: il modulo calcola `data/` da `process.cwd()`.
let workDir: string;

beforeEach(async () => {
    workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "signed-contracts-"));
    vi.spyOn(process, "cwd").mockReturnValue(workDir);
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(workDir, { recursive: true, force: true });
});

const contractDir = () => path.join(workDir, "data", "signed-contracts");

describe("signedContractFiles", () => {
    it("salva il PDF come <id>.pdf solo al commit, e lo rilegge identico", async () => {
        const content = Buffer.from("%PDF-1.7 primo");
        const staged = await stageSignedContractFile(7, content);

        expect(await readSignedContractFile(7)).toBeNull();

        await staged.commit();

        expect((await readSignedContractFile(7))?.equals(content)).toBe(true);
        expect(await fs.promises.readdir(contractDir())).toEqual(["7.pdf"]);
    });

    it("un nuovo caricamento sostituisce il file; uno scartato lascia quello di prima", async () => {
        await (await stageSignedContractFile(7, Buffer.from("vecchio"))).commit();
        await (await stageSignedContractFile(7, Buffer.from("scartato"))).discard();

        expect((await readSignedContractFile(7))?.toString()).toBe("vecchio");
        expect(await fs.promises.readdir(contractDir())).toEqual(["7.pdf"]);

        await (await stageSignedContractFile(7, Buffer.from("nuovo"))).commit();

        expect((await readSignedContractFile(7))?.toString()).toBe("nuovo");
    });

    it("rimuove il file, e non protesta se non c'era", async () => {
        await (await stageSignedContractFile(3, Buffer.from("x"))).commit();

        await removeSignedContractFile(3);
        await removeSignedContractFile(3);

        expect(await readSignedContractFile(3)).toBeNull();
    });

    it("senza cartella la lettura dice che il file non c'è", async () => {
        expect(await readSignedContractFile(99)).toBeNull();
    });
});
