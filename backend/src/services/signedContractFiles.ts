import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * I PDF dei contratti firmati, su disco: `data/signed-contracts/<id del contratto>.pdf`. Nel
 * database (`signed_contract`) restano solo nome originale, dimensione e data di caricamento,
 * così i documenti non appesantiscono il database. La cartella è una voce di
 * `backedUpDataEntries` (`backupFiles.ts`): va nei backup e torna con il ripristino.
 *
 * Il nome del file è l'id del contratto, mai il nome scelto da chi carica: niente percorsi da
 * controllare e un solo file per contratto, sovrascritto da un nuovo caricamento.
 */
export const signedContractsDirName = "signed-contracts";

const signedContractsDir = () => path.join(process.cwd(), "data", signedContractsDirName);

const filePathFor = (contractId: number) => path.join(signedContractsDir(), `${contractId}.pdf`);

/**
 * Prepara il nuovo file accanto a quello definitivo, senza ancora sostituirlo: `commit` lo mette
 * al suo posto (un rename, che non lascia mai un PDF scritto a metà), `discard` lo butta. Così la
 * rotta salva prima il file, poi la riga nel database, e solo se anche quella riesce lo pubblica.
 */
export const stageSignedContractFile = async (contractId: number, content: Buffer) => {
    await fs.promises.mkdir(signedContractsDir(), { recursive: true });
    const tempPath = `${filePathFor(contractId)}.tmp-${crypto.randomUUID()}`;
    await fs.promises.writeFile(tempPath, content);

    return {
        commit: () => fs.promises.rename(tempPath, filePathFor(contractId)),
        discard: () => fs.promises.rm(tempPath, { force: true }),
    };
};

/** Il PDF del contratto, o null se il file non c'è. */
export const readSignedContractFile = async (contractId: number): Promise<Buffer | null> => {
    try {
        return await fs.promises.readFile(filePathFor(contractId));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }

        throw error;
    }
};

/** Cancella il PDF del contratto; nessun errore se non c'era. */
export const removeSignedContractFile = (contractId: number) =>
    fs.promises.rm(filePathFor(contractId), { force: true });
