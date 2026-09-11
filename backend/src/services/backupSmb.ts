/**
 * Copia del backup sulla condivisione di rete (NAS) tramite smbclient.
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { BackupManagerError } from "./backupError";
import { backupFileNameScanPattern, sortBackupFileNamesByAge } from "./backupFiles";

export const defaultSmbPort = 445;
const smbTestTimeoutMs = 15_000;
const smbMkdirTimeoutMs = 15_000;
const smbPutTimeoutMs = 30 * 60 * 1000;

export type SmbConnectionConfig = {
    host: string;
    share: string;
    path: string;
    domain: string;
    port: number;
    username: string;
    password: string;
};

const smbTarget = (config: SmbConnectionConfig) => `//${config.host}/${config.share}`;

/**
 * Caratteri ammessi nella cartella remota sul NAS.
 *
 * smbclient tratta la stringa passata a `-c` come una lista di comandi separati da `;`, e
 * lo split avviene *prima* del quoting: le virgolette attorno al percorso non isolano
 * nulla. Un valore come `cartella; get payload /app/dist/index.js; echo ` nel campo
 * "cartella remota" faceva quindi eseguire a smbclient comandi scelti da chi lo scriveva.
 *
 * Verificato contro un server Samba vero: la shell escape `!` non esiste piu' nelle
 * versioni attuali ("!: command not found"), ma `get` e `put` bastano da soli - scrivono e
 * leggono file locali qualsiasi con i privilegi del backend. Da li' si esce dal container:
 * `put` porta `data/secret.key` o un dump del database sulla condivisione di chi attacca,
 * `get` sovrascrive il codice in `dist/`, che al riavvio successivo viene eseguito.
 *
 * Ripulire l'input dai caratteri pericolosi è una difesa fragile - basta dimenticarne uno,
 * e prima si toglievano solo le virgolette - quindi qui si accetta soltanto ciò che serve
 * davvero a un percorso SMB e si rifiuta tutto il resto. Lo spazio resta ammesso, ed è il
 * motivo per cui il percorso continua a essere racchiuso fra virgolette nel comando.
 */
export const smbPathPattern = /^[A-Za-z0-9 ._/\\-]*$/;

export const smbPathRequirementsMessage =
    "La cartella remota può contenere solo lettere, cifre, spazi e i caratteri . _ - / \\";

/**
 * Ultima barriera prima di comporre il comando: le rotte validano già con lo stesso
 * pattern, ma il percorso arriva anche dalle impostazioni salvate su disco, che un
 * ripristino da archivio può sostituire. Non è un valore di cui fidarsi qui.
 */
const safeRemotePath = (config: SmbConnectionConfig): string => {
    const remotePath = config.path.trim();

    if (!smbPathPattern.test(remotePath)) {
        throw new BackupManagerError(smbPathRequirementsMessage, 400);
    }

    return remotePath;
};

// smbclient stampa la maggior parte delle diagnostiche (NT_STATUS_*, "Connection to
// ... failed") su stdout, non su stderr. Guardare solo stderr lascia come unico
// messaggio "terminato con codice 1", che non dice nulla — e soprattutto impedisce a
// ensureSmbRemoteDir di riconoscere NT_STATUS_OBJECT_NAME_COLLISION, cioè il caso
// normalissimo di cartella remota già esistente.
export const composeSmbErrorMessage = (stderr: string, stdout: string, code: number | null) => {
    const details = [stderr.trim(), stdout.trim()].filter(Boolean).join(" | ");

    return details || `smbclient terminato con codice ${code}`;
};

const runSmbClient = async (config: SmbConnectionConfig, command: string, timeoutMs: number): Promise<string> => {
    const args = [smbTarget(config), "-U", config.username, "-p", String(config.port)];

    if (config.domain) {
        args.push("-W", config.domain);
    }

    args.push("-c", command);

    const env = {
        ...process.env,
        PASSWD: config.password,
    };

    return new Promise<string>((resolve, reject) => {
        const child = spawn("smbclient", args, { env });
        let stderr = "";
        let stdout = "";
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);

        child.stdin?.end();

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        child.on("error", (error: NodeJS.ErrnoException) => {
            clearTimeout(timer);

            if (error.code === "ENOENT") {
                reject(new BackupManagerError("smbclient non trovato. Installa samba-client nel backend", 500));
                return;
            }

            reject(new BackupManagerError(`Errore avvio smbclient: ${error.message}`, 500));
        });

        child.on("close", (code) => {
            clearTimeout(timer);

            if (timedOut) {
                reject(new BackupManagerError("Timeout durante la comunicazione con il NAS", 504));
                return;
            }

            if (code === 0) {
                resolve(stdout);
                return;
            }

            reject(new BackupManagerError(composeSmbErrorMessage(stderr, stdout, code), 502));
        });
    });
};

// La cartella remota che esiste già è il caso normale, non un errore: dal secondo
// backup in poi il mkdir fallisce sempre così. Le versioni di Samba riportano la
// collisione con codici diversi, quindi si accettano entrambi.
export const isAlreadyExistsSmbError = (message: string) =>
    message.includes("NT_STATUS_OBJECT_NAME_COLLISION") || message.includes("NT_STATUS_OBJECT_NAME_EXISTS");

const ensureSmbRemoteDir = async (config: SmbConnectionConfig) => {
    const remotePath = safeRemotePath(config);

    if (!remotePath) {
        return;
    }

    try {
        await runSmbClient(config, `mkdir "${remotePath}"`, smbMkdirTimeoutMs);
    } catch (error) {
        const message = error instanceof Error ? error.message : "";

        if (isAlreadyExistsSmbError(message)) {
            return;
        }

        throw error;
    }
};

export const testSmbConnection = async (config: SmbConnectionConfig) => {
    const remotePath = safeRemotePath(config);
    const command = remotePath ? `cd "${remotePath}"; ls` : "ls";

    await runSmbClient(config, command, smbTestTimeoutMs);
};

export const uploadDumpToSmb = async (config: SmbConnectionConfig, localFilePath: string) => {
    await ensureSmbRemoteDir(config);

    const remotePath = safeRemotePath(config);
    const fileName = path.basename(localFilePath);
    const putCommand = `put "${localFilePath}" "${fileName}"`;
    const command = remotePath ? `cd "${remotePath}"; ${putCommand}` : putCommand;

    await runSmbClient(config, command, smbPutTimeoutMs);
};

// L'output di `ls` elenca anche "." e ".." e le dimensioni/date di ogni voce: il modo
// affidabile per isolare i nomi dei backup e cercare il pattern nel testo, non
// spezzare le righe per spazi (i nomi restanti nella cartella non seguono lo schema).
const extractBackupFileNames = (lsOutput: string): string[] => lsOutput.match(backupFileNameScanPattern) ?? [];

const listSmbBackupFileNames = async (config: SmbConnectionConfig): Promise<string[]> => {
    const remotePath = safeRemotePath(config);
    const command = remotePath ? `cd "${remotePath}"; ls` : "ls";

    const output = await runSmbClient(config, command, smbTestTimeoutMs);
    return extractBackupFileNames(output);
};

// `fileName` non arriva dall'utente: è uno dei nomi estratti dall'output di `ls` con
// backupFileNameScanPattern, che ammette solo `db-backup-<timestamp>.tar.gz` e il formato
// storico. Nessun carattere interpretato da smbclient può quindi finire qui.
const deleteSmbFile = async (config: SmbConnectionConfig, fileName: string) => {
    const remotePath = safeRemotePath(config);
    const delCommand = `del "${fileName}"`;
    const command = remotePath ? `cd "${remotePath}"; ${delCommand}` : delCommand;

    await runSmbClient(config, command, smbMkdirTimeoutMs);
};

// Stessa logica di pruneOldBackups (backupFiles.ts), applicata ai nomi elencati sul
// NAS invece che alla cartella locale.
export const computeSmbFilesToDelete = (fileNames: string[], keep: number): string[] => {
    const sorted = sortBackupFileNamesByAge(fileNames);
    return sorted.slice(0, Math.max(0, sorted.length - keep));
};

// Cancellazioni in sequenza, non in parallelo: ogni chiamata apre una propria sessione
// smbclient e il NAS resta comunque il collo di bottiglia; in pratica c'e al massimo un
// file da eliminare per esecuzione, quindi il costo e trascurabile.
export const pruneOldSmbBackups = async (config: SmbConnectionConfig, keep: number) => {
    const fileNames = await listSmbBackupFileNames(config);
    const filesToDelete = computeSmbFilesToDelete(fileNames, keep);

    for (const fileName of filesToDelete) {
        await deleteSmbFile(config, fileName);
    }
};
