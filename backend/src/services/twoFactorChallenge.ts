import crypto from "node:crypto";

/**
 * Lo stato "password giusta, manca il codice" fra i due passi del login.
 *
 * Sta in memoria e non nel database, come il limitatore dei tentativi
 * (`loginRateLimit.ts`) e per le stesse ragioni: è uno stato che vive minuti, il container
 * è uno solo, e il modulo resta verificabile senza una connessione attiva. L'alternativa —
 * una colonna sulla tabella `session` — avrebbe messo in giro un cookie di sessione non
 * ancora valido, da ricontrollare in `requireAuth` a ogni richiesta dell'app: molta più
 * superficie per un errore che vale un accesso.
 *
 * Costo accettato: al riavvio del backend chi era a metà login ridigita la password.
 */

export const twoFactorChallengeTtlMs = 5 * 60 * 1000;

/**
 * Un milione di combinazioni non sono tante se si può provare all'infinito. Cinque
 * tentativi e il challenge muore: si riparte dalla password, che è a sua volta sotto il
 * limitatore per IP.
 */
export const twoFactorChallengeMaxAttempts = 5;

// Stesso ragionamento del tetto in `loginRateLimit.ts`: creare challenge costa una richiesta
// con credenziali valide, ma la memoria non deve dipendere dalla buona volontà di chi chiama.
export const twoFactorChallengeMaxEntries = 10_000;

const challengeIdBytes = 32;

type Challenge = { userId: number; expiresAt: number; attempts: number };

const challengesById = new Map<string, Challenge>();

/**
 * Scarta i challenge scaduti e, se ancora non bastasse, quelli che scadono per primi:
 * sacrificare i più vicini alla scadenza è preferibile a sacrificare quelli appena creati,
 * che appartengono a chi sta digitando il codice proprio adesso.
 */
const prune = (now: number): void => {
    for (const [id, challenge] of challengesById) {
        if (challenge.expiresAt <= now) {
            challengesById.delete(id);
        }
    }

    if (challengesById.size < twoFactorChallengeMaxEntries) {
        return;
    }

    const excess = challengesById.size - twoFactorChallengeMaxEntries + 1;
    const oldestFirst = [...challengesById.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);

    for (const [id] of oldestFirst.slice(0, excess)) {
        challengesById.delete(id);
    }
};

/**
 * L'id viaggia nel corpo della risposta, non in un cookie: non è una sessione, e non deve
 * essere rimandato indietro dal browser su ogni richiesta. Resta comunque 256 bit casuali,
 * perché indovinarne uno valido significherebbe saltare il secondo fattore di qualcun altro.
 */
export const createTwoFactorChallenge = (userId: number, now = Date.now()): string => {
    if (challengesById.size >= twoFactorChallengeMaxEntries) {
        prune(now);
    }

    const challengeId = crypto.randomBytes(challengeIdBytes).toString("hex");
    challengesById.set(challengeId, { userId, expiresAt: now + twoFactorChallengeTtlMs, attempts: 0 });

    return challengeId;
};

/** L'utente a cui appartiene il challenge, oppure null se non esiste più o è scaduto. */
export const getTwoFactorChallengeUserId = (challengeId: string, now = Date.now()): number | null => {
    const challenge = challengesById.get(challengeId);

    if (!challenge) {
        return null;
    }

    if (challenge.expiresAt <= now) {
        challengesById.delete(challengeId);
        return null;
    }

    return challenge.userId;
};

/**
 * Registra un codice sbagliato. Restituisce `false` quando il challenge si è esaurito ed è
 * stato eliminato, così chi chiama sa che il prossimo passo dell'utente è ridigitare la
 * password invece di riprovare il codice.
 */
export const registerFailedTwoFactorAttempt = (challengeId: string): boolean => {
    const challenge = challengesById.get(challengeId);

    if (!challenge) {
        return false;
    }

    challenge.attempts += 1;

    if (challenge.attempts >= twoFactorChallengeMaxAttempts) {
        challengesById.delete(challengeId);
        return false;
    }

    return true;
};

/** Da chiamare appena il challenge ha esaurito il suo scopo: codice giusto, o rinuncia. */
export const deleteTwoFactorChallenge = (challengeId: string): void => {
    challengesById.delete(challengeId);
};

/** Solo per i test: riporta il modulo allo stato iniziale. */
export const resetTwoFactorChallenges = (): void => {
    challengesById.clear();
};

/** Solo per i test: numero di challenge attualmente in memoria. */
export const twoFactorChallengeSize = (): number => challengesById.size;
