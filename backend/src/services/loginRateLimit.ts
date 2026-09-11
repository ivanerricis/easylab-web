/**
 * Limitatore dei tentativi di login, per chiave. Le chiavi le compone authManager:
 *
 * - l'IP da solo, per il tetto complessivo di chi arriva da quell'indirizzo;
 * - IP più nome utente, per la password al login;
 * - l'utente, per il secondo fattore e per la password richiesta di nuovo a chi è già dentro.
 *
 * Contatori indipendenti nella stessa mappa: lo stesso tetto di memoria e la stessa finestra
 * valgono per tutti.
 *
 * Estratto da authManager perché non tocca il database: così è testabile senza una
 * connessione attiva, e la logica di scadenza/pulizia sta in un posto solo.
 */

export const loginRateLimitWindowMs = 15 * 60 * 1000;
export const loginRateLimitMaxAttempts = 5;
/**
 * Il tetto per IP, più alto di quello per chiave e mai azzerato da un login riuscito (scade
 * solo con la finestra). Più alto perché dietro lo stesso IP pubblico del laboratorio ci sono
 * tutti i colleghi, e cinque errori di battitura sparsi fra loro non devono chiudere fuori
 * nessuno; mai azzerato perché altrimenti chi ha un account valido potrebbe entrare con quello
 * fra un tentativo e l'altro sugli account altrui. Senza questo tetto, da un solo indirizzo si
 * potrebbero provare cinque password su *ogni* nome utente.
 */
export const loginRateLimitMaxAttemptsPerIp = 20;
// Una volta esposta su internet la mappa dei tentativi diventa memoria che un estraneo
// può far crescere a piacere: ogni IP sorgente diverso crea una entry, e prima le entry
// venivano rimosse solo al login riuscito. Con un tetto massimo la memoria resta limitata
// anche sotto scansione continua da indirizzi che ruotano.
export const loginRateLimitMaxEntries = 10_000;

type Attempt = { count: number; resetAt: number };

const attemptsByKey = new Map<string, Attempt>();

/**
 * Scarta le entry scadute e, se ancora non bastasse, quelle che scadono per prime.
 * Sacrificare le più vicine alla scadenza è preferibile a sacrificare quelle appena
 * create: sono le meno informative rimaste.
 */
const prune = (now: number): void => {
    for (const [key, entry] of attemptsByKey) {
        if (entry.resetAt <= now) {
            attemptsByKey.delete(key);
        }
    }

    if (attemptsByKey.size < loginRateLimitMaxEntries) {
        return;
    }

    const excess = attemptsByKey.size - loginRateLimitMaxEntries + 1;
    const oldestFirst = [...attemptsByKey.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);

    for (const [key] of oldestFirst.slice(0, excess)) {
        attemptsByKey.delete(key);
    }
};

const hasReachedLimit = (key: string, maxAttempts: number, now: number): boolean => {
    const entry = attemptsByKey.get(key);

    return Boolean(entry && entry.resetAt > now && entry.count >= maxAttempts);
};

/** true se la chiave ha esaurito i tentativi nella finestra corrente. */
export const isLoginRateLimited = (key: string, now = Date.now()): boolean =>
    hasReachedLimit(key, loginRateLimitMaxAttempts, now);

/** Come `isLoginRateLimited`, ma con il tetto complessivo per IP. */
export const isIpLoginRateLimited = (ip: string, now = Date.now()): boolean =>
    hasReachedLimit(ip, loginRateLimitMaxAttemptsPerIp, now);

export const registerFailedLogin = (key: string, now = Date.now()): void => {
    const entry = attemptsByKey.get(key);

    if (!entry || entry.resetAt <= now) {
        if (attemptsByKey.size >= loginRateLimitMaxEntries) {
            prune(now);
        }

        attemptsByKey.set(key, { count: 1, resetAt: now + loginRateLimitWindowMs });
        return;
    }

    entry.count += 1;
};

export const registerSuccessfulLogin = (key: string): void => {
    attemptsByKey.delete(key);
};

/** Solo per i test: riporta il limitatore allo stato iniziale. */
export const resetLoginRateLimit = (): void => {
    attemptsByKey.clear();
};

/** Solo per i test: numero di chiavi attualmente tracciate. */
export const loginRateLimitSize = (): number => attemptsByKey.size;
