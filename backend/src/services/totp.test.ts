import { describe, expect, it } from "vitest";
import {
    buildOtpauthUri,
    decodeBase32,
    encodeBase32,
    generateTotpCode,
    generateTotpSecret,
    stepForTimestamp,
    totpStepSeconds,
    verifyTotp,
} from "./totp";

// Il segreto dei vettori ufficiali della RFC 6238: la stringa ASCII "12345678901234567890",
// cioè esattamente i 20 byte che l'algoritmo si aspetta.
const rfcSecret = Buffer.from("12345678901234567890", "utf-8");
const rfcSecretBase32 = encodeBase32(rfcSecret);

describe("base32", () => {
    // Il segreto attraversa il confine fra noi e l'app dell'utente scritto così: se l'alfabeto
    // o l'ordine dei bit fossero sbagliati, il QR verrebbe letto senza errori e i codici non
    // combacerebbero mai, senza nessun messaggio che spieghi il perché.
    it("codifica il segreto dei vettori RFC come fanno le app di autenticazione", () => {
        expect(rfcSecretBase32).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    });

    it("torna ai byte di partenza", () => {
        const secret = Buffer.from("segreto qualunque, non allineato a 5 bit", "utf-8");

        expect(decodeBase32(encodeBase32(secret))).toEqual(secret);
    });

    // Il segreto viene mostrato a schermo per chi lo inserisce a mano invece di inquadrare il
    // QR: arriva indietro come capita.
    it("accetta minuscole, spazi e riempimento", () => {
        expect(decodeBase32("gezd gnbv gy3t qojq=")).toEqual(decodeBase32("GEZDGNBVGY3TQOJQ"));
    });

    it("rifiuta i caratteri fuori alfabeto", () => {
        expect(() => decodeBase32("GEZD1NBV")).toThrow();
    });
});

describe("verifyTotp", () => {
    // Vettori della RFC 6238 (appendice B), colonna SHA-1. Là i codici sono a 8 cifre: le
    // nostre 6 ne sono le ultime, perché il troncamento è lo stesso modulo con un esponente
    // più basso.
    it.each([
        [59, "287082"],
        [1111111109, "081804"],
        [1111111111, "050471"],
        [1234567890, "005924"],
        [2000000000, "279037"],
        [20000000000, "353130"],
    ])("genera il codice previsto dalla RFC al secondo %i", (seconds, expected) => {
        expect(generateTotpCode(rfcSecretBase32, seconds * 1000)).toBe(expected);
    });

    it("accetta il codice del passo corrente", () => {
        const now = 1234567890 * 1000;

        expect(verifyTotp(rfcSecretBase32, "005924", { now })).toEqual({
            valid: true,
            step: stepForTimestamp(now),
        });
    });

    // Gli orologi dei telefoni sbagliano di secondi: senza questa tolleranza chi digita il
    // codice a cavallo del cambio si vedrebbe rifiutare un codice giusto.
    it("tollera un passo di scarto in avanti e indietro", () => {
        const now = 1234567890 * 1000;
        const stepMs = totpStepSeconds * 1000;
        const previous = generateTotpCode(rfcSecretBase32, now - stepMs);
        const next = generateTotpCode(rfcSecretBase32, now + stepMs);

        expect(verifyTotp(rfcSecretBase32, previous, { now }).valid).toBe(true);
        expect(verifyTotp(rfcSecretBase32, next, { now }).valid).toBe(true);
    });

    it("non tollera due passi di scarto", () => {
        const now = 1234567890 * 1000;
        const stepMs = totpStepSeconds * 1000;
        const tooOld = generateTotpCode(rfcSecretBase32, now - 2 * stepMs);

        expect(verifyTotp(rfcSecretBase32, tooOld, { now }).valid).toBe(false);
    });

    // Il caso che rende il codice davvero monouso: entro i suoi trenta secondi chi lo
    // intercetta potrebbe rigiocarlo, se non ci ricordassimo qual è stato l'ultimo accettato.
    it("rifiuta un codice già usato, e anche uno più vecchio di quello", () => {
        const now = 1234567890 * 1000;
        const currentStep = stepForTimestamp(now);
        const stepMs = totpStepSeconds * 1000;
        const previous = generateTotpCode(rfcSecretBase32, now - stepMs);

        expect(verifyTotp(rfcSecretBase32, "005924", { now, lastStep: currentStep }).valid).toBe(false);
        expect(verifyTotp(rfcSecretBase32, previous, { now, lastStep: currentStep }).valid).toBe(false);
    });

    it("accetta il passo successivo a quello già usato", () => {
        const now = 1234567890 * 1000;
        const currentStep = stepForTimestamp(now);

        expect(verifyTotp(rfcSecretBase32, "005924", { now, lastStep: currentStep - 1 })).toEqual({
            valid: true,
            step: currentStep,
        });
    });

    it("rifiuta codici della lunghezza sbagliata o non numerici", () => {
        const now = 1234567890 * 1000;

        expect(verifyTotp(rfcSecretBase32, "00592", { now }).valid).toBe(false);
        expect(verifyTotp(rfcSecretBase32, "0059240", { now }).valid).toBe(false);
        expect(verifyTotp(rfcSecretBase32, "abcdef", { now }).valid).toBe(false);
        expect(verifyTotp(rfcSecretBase32, "", { now }).valid).toBe(false);
    });

    // Un segreto illeggibile (per esempio decifrato con la chiave sbagliata dopo un
    // ripristino) non deve far esplodere il login: chi chiama lo tratta come 2FA assente.
    it("non solleva eccezioni su un segreto malformato", () => {
        expect(verifyTotp("non-un-base32!", "005924").valid).toBe(false);
    });

    it("genera segreti diversi a ogni chiamata", () => {
        expect(generateTotpSecret()).not.toBe(generateTotpSecret());
    });
});

describe("buildOtpauthUri", () => {
    it("mette emittente e account nell'etichetta e ripete l'emittente fra i parametri", () => {
        const uri = buildOtpauthUri({ secretBase32: "ABCDEF", account: "mario", issuer: "EasyLab" });

        expect(uri).toBe("otpauth://totp/EasyLab:mario?secret=ABCDEF&issuer=EasyLab");
    });

    // Il nome del laboratorio è configurabile e può contenere spazi: senza codifica l'URI
    // risulterebbe troncato dall'app che lo legge.
    it("codifica spazi e caratteri speciali", () => {
        const uri = buildOtpauthUri({
            secretBase32: "ABCDEF",
            account: "mario rossi",
            issuer: "Lab & Co",
        });

        expect(uri).toContain("otpauth://totp/Lab%20%26%20Co:mario%20rossi?");
        expect(uri).toContain("issuer=Lab+%26+Co");
    });
});
