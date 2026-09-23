/**
 * Limitatore dei tentativi di login, per chiave. Le chiavi le compone authManager:
 *
 * - l'IP da solo, per il tetto complessivo di chi arriva da quell'indirizzo;
 * - IP più nome utente, per la password al login;
 * - l'utente, per il secondo fattore e per la password richiesta di nuovo a chi è già dentro.
 *
 * - il solo nome utente, per il tetto complessivo su un account da qualunque indirizzo.
 *
 * Contatori indipendenti nella stessa mappa: lo stesso tetto di memoria e la stessa finestra
 * valgono per tutti.
 *
 * Estratto da authManager perché non tocca il database: così è testabile senza una
 * connessione attiva, e la logica di scadenza/pulizia sta in un posto solo.
 */
import net from "node:net";
import { pruneExpiring } from "./expiringMap";

/**
 * Espande un IPv6 negli otto gruppi esadecimali, risolvendo `::` e un IPv4 finale
 * (`::ffff:1.2.3.4`). Chi chiama ha già verificato con `net.isIPv6` che l'indirizzo è valido.
 */
const expandIpv6 = (address: string): number[] => {
    let value = address.toLowerCase();
    const lastColon = value.lastIndexOf(":");
    const tail = value.slice(lastColon + 1);

    if (net.isIPv4(tail)) {
        const [a, b, c, d] = tail.split(".").map(Number);
        value = `${value.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    }

    const [head, rest] = value.split("::");
    const headGroups = head ? head.split(":") : [];
    const tailGroups = rest ? rest.split(":") : [];
    const zeros = rest === undefined ? [] : Array<string>(8 - headGroups.length - tailGroups.length).fill("0");

    return [...headGroups, ...zeros, ...tailGroups].map((group) => parseInt(group, 16));
};

/**
 * Il "chi" del limitatore: l'IPv4 così com'è, ma per IPv6 il prefisso /64.
 *
 * Un solo cliente IPv6 riceve di norma un /64 intero — qualunque VPS ne ha uno — cioè 2^64
 * indirizzi, e Cloudflare li inoltra tutti così come sono in `CF-Connecting-IP`. Contare per
 * indirizzo esatto dava a quel cliente un contatore nuovo a ogni indirizzo, quindi tentativi di
 * login illimitati. Il /64 è l'unità che un singolo cliente controlla davvero.
 *
 * Gli IPv4 mappati (`::ffff:1.2.3.4`, come li riporta un socket dual-stack) tornano IPv4, così
 * lo stesso client non finisce su due contatori a seconda di come è arrivato.
 */
export const rateLimitSubject = (ip: string): string => {
    const address = ip.split("%")[0];

    if (!net.isIPv6(address)) {
        return ip;
    }

    const groups = expandIpv6(address);
    const isIpv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;

    if (isIpv4Mapped) {
        return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
    }

    return `${groups
        .slice(0, 4)
        .map((group) => group.toString(16))
        .join(":")}::/64`;
};

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
/**
 * Il tetto per nome utente, da qualunque indirizzo. I contatori per IP da soli non fermano chi
 * dispone di molti indirizzi (più /64, una botnet): ognuno riparte da zero. Superato questo
 * tetto, su quell'account può ancora provare solo chi ci è già entrato di recente dallo stesso
 * indirizzo (vedi `rememberLoginSource`), così un attacco in corso non chiude fuori i colleghi
 * che lavorano dal laboratorio.
 */
export const loginRateLimitMaxAttemptsPerUsername = 10;
/** Per quanto un indirizzo resta "già usato con successo" per un account. */
export const knownLoginSourceTtlMs = 30 * 24 * 60 * 60 * 1000;
/** Nasce solo da login riusciti, quindi un estraneo non può farla crescere: il tetto è di scorta. */
export const knownLoginSourcesMaxEntries = 10_000;
// Una volta esposta su internet la mappa dei tentativi diventa memoria che un estraneo
// può far crescere a piacere: ogni IP sorgente diverso crea una entry, e prima le entry
// venivano rimosse solo al login riuscito. Con un tetto massimo la memoria resta limitata
// anche sotto scansione continua da indirizzi che ruotano.
export const loginRateLimitMaxEntries = 10_000;

type Attempt = { count: number; resetAt: number };

const attemptsByKey = new Map<string, Attempt>();

const prune = (now: number): void =>
    pruneExpiring(attemptsByKey, loginRateLimitMaxEntries, now, (entry) => entry.resetAt);

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

/** Come `isLoginRateLimited`, ma con il tetto complessivo per nome utente. */
export const isUsernameLoginRateLimited = (key: string, now = Date.now()): boolean =>
    hasReachedLimit(key, loginRateLimitMaxAttemptsPerUsername, now);

const knownLoginSources = new Map<string, number>();

const knownLoginSourceKey = (username: string, subject: string) => `${username}@${subject}`;

/** Da chiamare quando nasce una sessione: da qui in avanti quell'indirizzo è di casa per l'account. */
export const rememberLoginSource = (username: string, subject: string, now = Date.now()): void => {
    const key = knownLoginSourceKey(username, subject);

    // Tolta e rimessa, così l'ordine di inserimento della Map resta quello dell'ultimo uso e la
    // prima entry è sempre la più vecchia da scartare.
    knownLoginSources.delete(key);

    if (knownLoginSources.size >= knownLoginSourcesMaxEntries) {
        const oldest = knownLoginSources.keys().next().value;

        if (oldest !== undefined) {
            knownLoginSources.delete(oldest);
        }
    }

    knownLoginSources.set(key, now + knownLoginSourceTtlMs);
};

export const isKnownLoginSource = (username: string, subject: string, now = Date.now()): boolean =>
    (knownLoginSources.get(knownLoginSourceKey(username, subject)) ?? 0) > now;

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
    knownLoginSources.clear();
};

/** Solo per i test: numero di chiavi attualmente tracciate. */
export const loginRateLimitSize = (): number => attemptsByKey.size;
