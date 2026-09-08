import crypto from "node:crypto";

/**
 * Codici a tempo (TOTP, RFC 6238) per il secondo fattore di autenticazione, più il Base32
 * (RFC 4648) con cui il segreto viaggia verso l'app dell'utente.
 *
 * Scritto a mano invece di aggiungere una libreria, per la stessa ragione per cui lo sono
 * scrypt in `authManager.ts` e AES-GCM in `secretCrypto.ts`: è un HMAC-SHA1 su un contatore
 * più un troncamento, sta in poche decine di righe, e si verifica contro i vettori
 * pubblicati nella RFC — che è esattamente quello che fa `totp.test.ts`. In cambio il
 * percorso critico del login non acquista una dipendenza da tenere aggiornata.
 *
 * Il modulo non tocca né il database né il filesystem: riceve il segreto già decifrato e
 * restituisce un esito, così resta verificabile senza una connessione attiva.
 */

// SHA-1 non è una scelta: è l'algoritmo che le app di autenticazione (Google Authenticator,
// Aegis, 1Password) assumono quando l'URI otpauth non dice altro. Qui non serve resistenza
// alle collisioni — serve un HMAC su un contatore noto — quindi la debolezza per cui SHA-1
// è stato abbandonato altrove non si applica.
const hashAlgorithm = "sha1";

export const totpStepSeconds = 30;
export const totpDigits = 6;

/**
 * Quanti passi accettare prima e dopo quello corrente. Uno solo: gli orologi dei telefoni
 * sono sincronizzati via rete e sbagliano di secondi, non di minuti, mentre ogni passo in
 * più raddoppia i codici validi nello stesso istante.
 */
export const totpAllowedStepDrift = 1;

/** 20 byte = la dimensione del blocco di SHA-1, quella raccomandata dalla RFC 4226. */
const secretBytes = 20;

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Senza `=` di riempimento: l'URI otpauth lo vuole così, e le app lo accettano solo così. */
export const encodeBase32 = (data: Buffer): string => {
    let bits = 0;
    let value = 0;
    let output = "";

    for (const byte of data) {
        value = (value << 8) | byte;
        bits += 8;

        while (bits >= 5) {
            output += base32Alphabet[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += base32Alphabet[(value << (5 - bits)) & 31];
    }

    return output;
};

/**
 * Tollera minuscole, spazi e `=` finali: il segreto viene mostrato a schermo raggruppato in
 * blocchi da quattro, e chi lo ricopia a mano lo riscrive come gli viene.
 */
export const decodeBase32 = (encoded: string): Buffer => {
    const normalized = encoded.replace(/[\s=]/g, "").toUpperCase();
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (const character of normalized) {
        const index = base32Alphabet.indexOf(character);

        if (index === -1) {
            throw new Error("Segreto TOTP non valido");
        }

        value = (value << 5) | index;
        bits += 5;

        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }

    return Buffer.from(bytes);
};

export const generateTotpSecret = (): string => encodeBase32(crypto.randomBytes(secretBytes));

export const stepForTimestamp = (timestampMs: number): number => Math.floor(timestampMs / 1000 / totpStepSeconds);

/** RFC 4226 §5.3: HMAC del contatore, poi troncamento dinamico guidato dall'ultimo nibble. */
const codeForStep = (secret: Buffer, step: number): string => {
    const counter = Buffer.alloc(8);
    // `writeBigUInt64BE` e non due writeUInt32: il passo sta comodamente in 32 bit oggi, ma
    // la RFC definisce il contatore a 64 bit e le app lo trattano come tale.
    counter.writeBigUInt64BE(BigInt(step));

    const digest = crypto.createHmac(hashAlgorithm, secret).update(counter).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
        ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];

    return (binary % 10 ** totpDigits).toString().padStart(totpDigits, "0");
};

export const generateTotpCode = (secretBase32: string, timestampMs = Date.now()): string =>
    codeForStep(decodeBase32(secretBase32), stepForTimestamp(timestampMs));

const codesMatch = (expected: string, provided: string): boolean => {
    const expectedBuffer = Buffer.from(expected, "utf-8");
    const providedBuffer = Buffer.from(provided, "utf-8");

    // `timingSafeEqual` pretende buffer della stessa lunghezza, e la disuguaglianza di
    // lunghezza è comunque già nota a chi ha digitato il codice: non c'è nulla da nascondere
    // nel tempo di risposta, ma c'è un'eccezione da evitare.
    return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};

export type VerifyTotpOptions = {
    now?: number;
    /**
     * Ultimo passo già accettato per questo utente. Un codice vale trenta secondi: chi lo
     * intercetta (una spalla, un proxy, un phishing in tempo reale) potrebbe rigiocarlo
     * finché è vivo. Rifiutando ogni passo minore o uguale a quello salvato, ogni codice
     * entra una volta sola.
     */
    lastStep?: number | null;
};

export type VerifyTotpResult = { valid: false } | { valid: true; step: number };

export const verifyTotp = (
    secretBase32: string,
    code: string,
    { now = Date.now(), lastStep = null }: VerifyTotpOptions = {}
): VerifyTotpResult => {
    const normalizedCode = code.trim();

    if (!new RegExp(`^\\d{${totpDigits}}$`).test(normalizedCode)) {
        return { valid: false };
    }

    let secret: Buffer;

    try {
        secret = decodeBase32(secretBase32);
    } catch {
        return { valid: false };
    }

    const currentStep = stepForTimestamp(now);

    for (let offset = -totpAllowedStepDrift; offset <= totpAllowedStepDrift; offset += 1) {
        const step = currentStep + offset;

        if (!codesMatch(codeForStep(secret, step), normalizedCode)) {
            continue;
        }

        if (lastStep !== null && step <= lastStep) {
            return { valid: false };
        }

        return { valid: true, step };
    }

    return { valid: false };
};

export type OtpauthUriInput = {
    secretBase32: string;
    /** Lo username: è ciò che l'utente vede sotto l'emittente nell'elenco della sua app. */
    account: string;
    /** Il nome del laboratorio, da `companyManager`. */
    issuer: string;
};

/**
 * L'emittente compare due volte di proposito: nel percorso (`Issuer:account`) per le app
 * vecchie, e come parametro per quelle che seguono la specifica corrente. Algoritmo, cifre e
 * periodo restano quelli predefiniti, quindi non serve dichiararli.
 */
export const buildOtpauthUri = ({ secretBase32, account, issuer }: OtpauthUriInput): string => {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
    const parameters = new URLSearchParams({ secret: secretBase32, issuer });

    return `otpauth://totp/${label}?${parameters.toString()}`;
};
