/**
 * Il dump SQL di un ripristino, preparato perché psql non esegua nient'altro che SQL.
 *
 * psql non manda al server solo SQL: interpreta anche i meta-comandi, e fra questi `\!` apre
 * una shell. Un dump preparato apposta — caricato dalla pagina Impostazioni, o fatto caricare a
 * un admin — faceva quindi eseguire comandi scelti da chi l'aveva scritto dentro il container del
 * backend, dove stanno la chiave dei segreti e la cartella dell'aggiornamento automatico.
 *
 * La difesa è quella che PostgreSQL ha introdotto per lo stesso problema (16.10, CVE-2025-8714):
 * la modalità ristretta. Dopo `\restrict <chiave>` psql rifiuta ogni meta-comando tranne
 * `\unrestrict <chiave>`, ovunque si trovi — a inizio riga come in coda a una query — mentre
 * stringhe e dati dei `COPY` restano intatti. Verificato con psql 16.15, quello dell'immagine.
 * La chiave è casuale e nasce qui, dopo il caricamento: chi ha scritto il dump non la conosce e
 * non può uscire dalla modalità.
 *
 * I dump di pg_dump dalla 16.10 in poi si chiudono già da soli fra `\restrict K` e
 * `\unrestrict K`, con una chiave loro. Quelle due righe vanno tolte, perché dentro la nostra
 * modalità ristretta il loro `\restrict` sarebbe un meta-comando rifiutato. Si toglie solo ciò
 * che ha esattamente la forma che scrive pg_dump: il `\restrict` prima di qualunque istruzione
 * (lì non possono esserci dati di un `COPY`) e l'`\unrestrict` con la stessa chiave come ultima
 * riga del file. Tutto il resto passa com'è; se il dump contiene altri meta-comandi, psql si
 * ferma e il ripristino fallisce, che è l'effetto voluto.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import readline from "node:readline";
import { once } from "node:events";

const dumpRestrictPattern = /^\\restrict ([A-Za-z0-9]+)$/;

/** Solo lettere e cifre: è l'unico alfabeto che psql accetta per la chiave. */
export const generateRestrictKey = () => crypto.randomBytes(32).toString("hex");

const isHeaderLine = (line: string) => line.trim() === "" || line.startsWith("--");

export const writeRestrictedSql = async (
    sourcePath: string,
    targetPath: string,
    restrictKey: string = generateRestrictKey()
): Promise<void> => {
    if (!/^[A-Za-z0-9]+$/.test(restrictKey)) {
        throw new Error("La chiave della modalità ristretta può contenere solo lettere e cifre");
    }

    const input = fs.createReadStream(sourcePath, { encoding: "utf-8" });
    const output = fs.createWriteStream(targetPath, { encoding: "utf-8", mode: 0o600 });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });

    const write = async (text: string) => {
        if (!output.write(text)) {
            await once(output, "drain");
        }
    };

    let inHeader = true;
    let dumpKey: string | null = null;
    // Righe trattenute: l'`\unrestrict` finale di pg_dump e le righe vuote dopo di lui. Si
    // scrivono solo se dopo arriva altro, cioè se non era davvero la fine del file.
    let held: string[] = [];

    try {
        await write(`\\restrict ${restrictKey}\n`);

        for await (const line of lines) {
            if (inHeader) {
                if (isHeaderLine(line)) {
                    await write(`${line}\n`);
                    continue;
                }

                inHeader = false;
                const match = dumpRestrictPattern.exec(line);

                if (match) {
                    dumpKey = match[1];
                    continue;
                }
            }

            if (held.length > 0) {
                if (line.trim() === "") {
                    held.push(line);
                    continue;
                }

                for (const heldLine of held) {
                    await write(`${heldLine}\n`);
                }

                held = [];
            }

            if (dumpKey !== null && line === `\\unrestrict ${dumpKey}`) {
                held = [line];
                continue;
            }

            await write(`${line}\n`);
        }

        // Quello che resta trattenuto è l'`\unrestrict` di pg_dump in fondo al file: non si scrive.
        output.end();
        await once(output, "finish");
    } catch (error) {
        output.destroy();
        throw error;
    } finally {
        lines.close();
        input.destroy();
    }
};
