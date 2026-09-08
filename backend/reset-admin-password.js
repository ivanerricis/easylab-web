// Rigenera la password di un utente direttamente sul database, per i casi in cui
// nessuno riesca più ad accedere all'app (es. unico utente rimasto e password persa).
// Eseguito dentro il container backend da scripts/reset-admin-password.sh.
// Usage: node reset-admin-password.js [username] [--reset-2fa]  (default: admin)
//
// La verifica in due passaggi resta al suo posto se non si chiede `--reset-2fa`: reimpostare
// la password non è una buona ragione per togliere anche il secondo fattore, e farlo di
// default significherebbe che chi ruba la password sa già come disinnescarlo. Il flag esiste
// per l'altro guaio — l'ultimo admin con la 2FA attiva, il telefono perso e nessun codice di
// recupero rimasto — dove l'unica via è la riga di comando sulla macchina. Chi ci arriva ha
// comunque già accesso al database, quindi non ottiene niente che non avesse.
const crypto = require('crypto');
const { Pool } = require('pg');
// Dal modulo compilato invece di una copia locale: questo script aveva il proprio alfabeto
// di generazione, rimasto indietro quando le password hanno dovuto contenere un numero e
// un carattere speciale. Uno script di emergenza che consegna una password non conforme è
// esattamente il momento peggiore per accorgersene.
const { generateCompliantPassword } = require('./dist/src/services/passwordPolicy');

const scryptKeyLength = 64;

const hashPassword = (password) =>
    new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.scrypt(password, salt, scryptKeyLength, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(`${salt}:${derivedKey.toString('hex')}`);
        });
    });

async function main() {
    const args = process.argv.slice(2);
    const resetTwoFactor = args.includes('--reset-2fa');
    const username = args.find((arg) => !arg.startsWith('--')) || 'admin';
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        const { rows } = await pool.query('SELECT id FROM "user" WHERE username = $1', [username]);

        if (rows.length === 0) {
            console.error(`Utente "${username}" non trovato.`);
            process.exitCode = 1;
            return;
        }

        const userId = rows[0].id;
        const password = generateCompliantPassword();
        const passwordHash = await hashPassword(password);

        await pool.query(
            'UPDATE "user" SET password_hash = $1, must_change_password = true WHERE id = $2',
            [passwordHash, userId]
        );
        await pool.query('DELETE FROM "session" WHERE user_id = $1', [userId]);

        if (resetTwoFactor) {
            await pool.query(
                'UPDATE "user" SET totp_secret = NULL, totp_confirmed_at = NULL, totp_last_step = NULL WHERE id = $1',
                [userId]
            );
            await pool.query('DELETE FROM "user_recovery_code" WHERE user_id = $1', [userId]);
        }

        console.log('============================================================');
        console.log(`Password rigenerata per l'utente "${username}":`);
        console.log(`  password: ${password}`);
        console.log("Dovrà essere cambiata al primo accesso. Eventuali sessioni attive per");
        console.log("questo utente sono state disconnesse.");
        if (resetTwoFactor) {
            console.log("La verifica in due passaggi è stata disattivata e i codici di recupero");
            console.log("cancellati: vanno riattivati dalle impostazioni dopo l'accesso.");
        } else {
            console.log("La verifica in due passaggi, se attiva, resta necessaria per accedere:");
            console.log("aggiungi --reset-2fa se anche quella è irraggiungibile.");
        }
        console.log('============================================================');
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error('Errore durante il reset della password:', error);
    process.exitCode = 1;
});
