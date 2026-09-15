import "dotenv/config";
import app from "./app";
import { startBackupScheduler, stopBackupScheduler } from "./services/backupManager";
import { ensureCatchAllIssue } from "./services/issueCatalog";
import { getCompanySettings } from "./services/companyManager";
import { ensureDefaultAdmin, startSessionCleanupScheduler, stopSessionCleanupScheduler } from "./services/authManager";
import { pool } from "./db";

const server = app.listen(3000, "0.0.0.0", () => {
    // I dati azienda portano il fuso orario del laboratorio, e caricarli lo fa adottare al
    // processo (`companyManager.applyTimeZone`): va fatto subito, non alla prima richiesta.
    void getCompanySettings().catch((error: unknown) => {
        console.error("Lettura dei dati azienda non riuscita:", error);
    });
    startBackupScheduler();
    startSessionCleanupScheduler();
    // Il `.catch` non è decorativo: senza, un errore qui diventa una rejection non
    // gestita e su Node 24 abbatte il processo appena avviato. In produzione il
    // database è già sano (depends_on: service_healthy), ma un intoppo momentaneo non
    // deve impedire al server di restare in piedi — l'admin verrà creato al riavvio.
    void ensureDefaultAdmin().catch((error: unknown) => {
        console.error("Creazione dell'utente amministratore iniziale non riuscita:", error);
    });
    // Stesso motivo del `.catch` qui sopra: un intoppo non deve impedire l'avvio, la voce
    // verrà ricreata al riavvio successivo.
    void ensureCatchAllIssue().catch((error: unknown) => {
        console.error('Verifica della voce "Altro" nel catalogo difetti non riuscita:', error);
    });
    console.log("Server running on port 3000");
});

/**
 * L'aggiornamento automatico ricrea i container (`docker compose up --build`), quindi il
 * backend riceve SIGTERM a intervalli regolari, non solo in casi eccezionali. Senza
 * questo handler Docker attende 10s e poi manda SIGKILL: le richieste in volo (un
 * download PDF, una scrittura di backup) vengono troncate e le connessioni al database
 * chiuse di colpo. Qui invece smettiamo di accettare connessioni, lasciamo terminare le
 * richieste già iniziate e chiudiamo il pool.
 */
const shutdownTimeoutMs = 10 * 1000;
let shuttingDown = false;

const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    console.log(`Ricevuto ${signal}, arresto in corso...`);

    stopBackupScheduler();
    stopSessionCleanupScheduler();

    // Se una richiesta resta appesa non possiamo aspettarla all'infinito: Docker manderebbe
    // comunque SIGKILL. Meglio forzare noi l'uscita dopo il timeout, dopo aver almeno
    // provato a chiudere il pool.
    const forceExitTimer = setTimeout(() => {
        console.error("Arresto forzato: richieste ancora in corso allo scadere del timeout.");
        process.exit(1);
    }, shutdownTimeoutMs);
    forceExitTimer.unref();

    server.close((error) => {
        void (async () => {
            if (error) {
                console.error("Errore durante la chiusura del server HTTP:", error);
            }

            try {
                await pool.end();
            } catch (poolError) {
                console.error("Errore durante la chiusura del pool database:", poolError);
            }

            clearTimeout(forceExitTimer);
            console.log("Arresto completato.");
            process.exit(error ? 1 : 0);
        })();
    });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
