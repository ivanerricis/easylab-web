import crypto from "node:crypto";

/**
 * Requisiti minimi delle password scelte dagli utenti, e generazione di password che li
 * soddisfano.
 *
 * Prima il requisito era solo "almeno 8 caratteri", ragionevole finché si entrava dalla
 * LAN. Con l'app pubblicata su un dominio il login è la porta d'ingresso da internet: il
 * limitatore dei tentativi rende lento un attacco a forza bruta, ma le prime prove sono
 * proprio quelle che indovinano le password ovvie.
 *
 * Validazione e generazione stanno insieme di proposito: le password che l'app consegna
 * agli utenti devono rispettare gli stessi requisiti che l'app impone, altrimenti
 * consegnerebbe una credenziale che poi rifiuterebbe se digitata. Il modulo non tocca il
 * database, quindi resta verificabile senza una connessione attiva.
 */

export const passwordMinLength = 8;

const digitPattern = /\d/;
// "Speciale" = tutto ciò che non è lettera o cifra, di proposito: un elenco chiuso di
// simboli ammessi rifiuterebbe password già valide altrove per un carattere fuori lista,
// spingendo gli utenti verso quelle più prevedibili.
const specialCharacterPattern = /[^A-Za-z0-9]/;

export const passwordRequirementsMessage =
    "La password deve avere almeno 8 caratteri e contenere almeno un numero e un carattere speciale";

export const isPasswordCompliant = (password: string): boolean =>
    password.length >= passwordMinLength && digitPattern.test(password) && specialCharacterPattern.test(password);

// Alfabeti senza caratteri ambigui (0/O, 1/l/I, ecc.) per password leggibili a schermo.
// Fra i simboli mancano virgolette e barre, che complicano la trascrizione a mano e
// dipendono dal layout di tastiera.
const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const digits = "23456789";
const specials = "!@#$%&*?";
const fullAlphabet = letters + digits + specials;

export const generatedPasswordLength = 16;

// Il modulo diretto su un byte favorirebbe i primi caratteri dell'alfabeto, perché 256 non
// è multiplo della sua lunghezza. Scartando la coda eccedente la distribuzione resta piatta.
// Esportato perché serve identico ai codici di recupero della 2FA (`recoveryCodes.ts`):
// riscriverlo là avrebbe voluto dire due copie di una correzione sottile, di cui una sola
// coperta dai test.
export const randomIndex = (max: number): number => {
    const limit = Math.floor(256 / max) * max;
    let value = crypto.randomBytes(1)[0];

    while (value >= limit) {
        value = crypto.randomBytes(1)[0];
    }

    return value % max;
};

const pickRandomCharacter = (alphabet: string): string => alphabet[randomIndex(alphabet.length)];

export const generateCompliantPassword = (length = generatedPasswordLength): string => {
    // Una cifra e un simbolo garantiti: estraendo tutto a caso dall'alfabeto completo una
    // password priva di simboli resterebbe possibile, e sarebbe rifiutata dai requisiti.
    const characters = [pickRandomCharacter(digits), pickRandomCharacter(specials)];

    while (characters.length < length) {
        characters.push(pickRandomCharacter(fullAlphabet));
    }

    // Fisher-Yates: senza mescolare, cifra e simbolo starebbero sempre nelle prime due
    // posizioni, riducendo a due caratteri quello che un attaccante deve indovinare.
    for (let i = characters.length - 1; i > 0; i -= 1) {
        const j = randomIndex(i + 1);
        [characters[i], characters[j]] = [characters[j], characters[i]];
    }

    return characters.join("");
};
