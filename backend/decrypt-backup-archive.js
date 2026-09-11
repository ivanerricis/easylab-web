// Decifra un archivio di backup fuori dall'interfaccia web: serve al ripristino da
// terminale (dump più grandi del limite di upload di Cloudflare, o ricostruzione su una
// VM nuova), dove non c'è un browser che parli con /api/settings/backup/restore.
// Eseguito dentro il container backend da scripts/restore-db.sh.
// Usage: node decrypt-backup-archive.js <sorgente> <destinazione> [chiave-esadecimale]
const { decryptArchiveFile } = require('./dist/src/services/backupCrypto');
const { decodeBackupKeyOverride, setBackupKey } = require('./dist/src/services/backupKey');

async function main() {
    const [sourcePath, destPath, keyHex] = process.argv.slice(2);

    if (!sourcePath || !destPath) {
        console.error('Uso: node decrypt-backup-archive.js <sorgente> <destinazione> [chiave]');
        process.exitCode = 1;
        return;
    }

    const keyOverride = keyHex ? decodeBackupKeyOverride(keyHex) : undefined;
    await decryptArchiveFile(sourcePath, destPath, keyOverride);

    // La chiave passata a mano ha decifrato con successo: diventa quella locale, cosi'
    // i prossimi backup su questo server (e un eventuale prossimo ripristino) la trovano
    // già pronta invece di richiederla di nuovo.
    if (keyHex) {
        await setBackupKey(keyHex);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
