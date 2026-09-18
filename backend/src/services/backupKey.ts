/**
 * Chiave dedicata alla cifratura dell'archivio di backup (data/backup.key), separata da
 * data/secret.key: quest'ultima cifra le password salvate nelle impostazioni e non deve
 * mai lasciare il server; questa invece è pensata per essere esportata dall'amministratore
 * e conservata altrove (password manager, cassaforte). Senza una copia esterna, un
 * disastro che porta via server e disco insieme renderebbe illeggibile anche l'ultimo
 * backup rimasto sul NAS - esattamente il caso in cui servirebbe di più.
 */
import { BackupManagerError } from "./backupError";
import { createKeyFile } from "./keyFile";

export const backupKeyLength = 32;

const backupKey = createKeyFile({
    fileName: "backup.key",
    length: backupKeyLength,
    invalidKeyError: () =>
        new BackupManagerError("data/backup.key non contiene una chiave valida: il file non è stato sovrascritto", 500),
});

export const getOrCreateBackupKey = backupKey.load;

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
    await backupKey.replace(decodeBackupKeyOverride(hex));
};

export const invalidateBackupKeyCache = backupKey.invalidate;
