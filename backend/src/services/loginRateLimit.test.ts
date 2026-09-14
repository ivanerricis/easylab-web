import { beforeEach, describe, expect, it } from "vitest";
import {
    isIpLoginRateLimited,
    isKnownLoginSource,
    isLoginRateLimited,
    isUsernameLoginRateLimited,
    knownLoginSourceTtlMs,
    knownLoginSourcesMaxEntries,
    loginRateLimitMaxAttempts,
    loginRateLimitMaxAttemptsPerIp,
    loginRateLimitMaxAttemptsPerUsername,
    loginRateLimitMaxEntries,
    loginRateLimitSize,
    loginRateLimitWindowMs,
    rateLimitSubject,
    registerFailedLogin,
    registerSuccessfulLogin,
    rememberLoginSource,
    resetLoginRateLimit,
} from "./loginRateLimit";

describe("rateLimitSubject", () => {
    it("lascia un IPv4 com'è", () => {
        expect(rateLimitSubject("1.2.3.4")).toBe("1.2.3.4");
    });

    it("riduce un IPv6 al suo /64: due indirizzi dello stesso cliente finiscono sullo stesso contatore", () => {
        expect(rateLimitSubject("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
        expect(rateLimitSubject("2001:0db8:0001:0002:ffff:eeee:dddd:cccc")).toBe("2001:db8:1:2::/64");
    });

    it("tiene separati due /64 diversi", () => {
        expect(rateLimitSubject("2001:db8:1:2::1")).not.toBe(rateLimitSubject("2001:db8:1:3::1"));
    });

    it("espande `::` in qualunque posizione e non distingue maiuscole e minuscole", () => {
        expect(rateLimitSubject("::1")).toBe("0:0:0:0::/64");
        expect(rateLimitSubject("2001:DB8::")).toBe("2001:db8:0:0::/64");
        expect(rateLimitSubject("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    });

    it("riporta a IPv4 un indirizzo mappato, come lo presenta un socket dual-stack", () => {
        expect(rateLimitSubject("::ffff:1.2.3.4")).toBe("1.2.3.4");
        expect(rateLimitSubject("::ffff:102:304")).toBe("1.2.3.4");
    });

    it("lascia com'è un valore che non è un indirizzo", () => {
        expect(rateLimitSubject("unknown")).toBe("unknown");
    });
});

describe("tetto per nome utente e indirizzi già usati", () => {
    beforeEach(() => {
        resetLoginRateLimit();
    });

    it("scatta dopo più tentativi di quello per IP + nome utente", () => {
        for (let attempt = 0; attempt < loginRateLimitMaxAttemptsPerUsername - 1; attempt += 1) {
            registerFailedLogin("nome:mario");
        }

        expect(isLoginRateLimited("nome:mario")).toBe(true);
        expect(isUsernameLoginRateLimited("nome:mario")).toBe(false);

        registerFailedLogin("nome:mario");
        expect(isUsernameLoginRateLimited("nome:mario")).toBe(true);
    });

    it("ricorda un indirizzo per account, fino alla scadenza", () => {
        const now = 1_000_000;
        rememberLoginSource("mario", "1.2.3.4", now);

        expect(isKnownLoginSource("mario", "1.2.3.4", now)).toBe(true);
        expect(isKnownLoginSource("anna", "1.2.3.4", now)).toBe(false);
        expect(isKnownLoginSource("mario", "5.6.7.8", now)).toBe(false);
        expect(isKnownLoginSource("mario", "1.2.3.4", now + knownLoginSourceTtlMs)).toBe(false);
    });

    it("oltre il tetto di memoria scarta l'indirizzo usato meno di recente", () => {
        rememberLoginSource("mario", "0.0.0.0");
        rememberLoginSource("anna", "0.0.0.0");

        for (let index = 0; index < knownLoginSourcesMaxEntries - 2; index += 1) {
            rememberLoginSource(`utente${index}`, "9.9.9.9");
        }

        // Mario è rientrato: ora la più vecchia è Anna.
        rememberLoginSource("mario", "0.0.0.0");
        rememberLoginSource("nuovo", "9.9.9.9");

        expect(isKnownLoginSource("mario", "0.0.0.0")).toBe(true);
        expect(isKnownLoginSource("anna", "0.0.0.0")).toBe(false);
        expect(isKnownLoginSource("nuovo", "9.9.9.9")).toBe(true);
    });
});

describe("loginRateLimit", () => {
    beforeEach(() => {
        resetLoginRateLimit();
    });

    it("blocca l'IP solo dopo aver esaurito i tentativi previsti", () => {
        for (let attempt = 0; attempt < loginRateLimitMaxAttempts - 1; attempt += 1) {
            registerFailedLogin("1.2.3.4");
            expect(isLoginRateLimited("1.2.3.4")).toBe(false);
        }

        registerFailedLogin("1.2.3.4");
        expect(isLoginRateLimited("1.2.3.4")).toBe(true);
    });

    it("non estende il blocco agli altri IP", () => {
        for (let attempt = 0; attempt < loginRateLimitMaxAttempts; attempt += 1) {
            registerFailedLogin("1.2.3.4");
        }

        expect(isLoginRateLimited("5.6.7.8")).toBe(false);
    });

    it("sblocca l'IP una volta scaduta la finestra", () => {
        const now = Date.now();

        for (let attempt = 0; attempt < loginRateLimitMaxAttempts; attempt += 1) {
            registerFailedLogin("1.2.3.4", now);
        }

        expect(isLoginRateLimited("1.2.3.4", now)).toBe(true);
        expect(isLoginRateLimited("1.2.3.4", now + loginRateLimitWindowMs + 1)).toBe(false);
    });

    it("azzera il conteggio dopo un login riuscito", () => {
        for (let attempt = 0; attempt < loginRateLimitMaxAttempts; attempt += 1) {
            registerFailedLogin("1.2.3.4");
        }

        registerSuccessfulLogin("1.2.3.4");
        expect(isLoginRateLimited("1.2.3.4")).toBe(false);
    });

    /**
     * Il tetto per IP è più alto di quello per chiave: dietro l'IP pubblico del laboratorio
     * ci sono tutti i colleghi, e qualche errore di battitura sparso fra loro non deve
     * chiudere fuori nessuno.
     */
    it("il tetto complessivo per IP scatta solo dopo più tentativi di quello per chiave", () => {
        for (let attempt = 0; attempt < loginRateLimitMaxAttemptsPerIp - 1; attempt += 1) {
            registerFailedLogin("1.2.3.4");
        }

        expect(loginRateLimitMaxAttemptsPerIp).toBeGreaterThan(loginRateLimitMaxAttempts);
        expect(isIpLoginRateLimited("1.2.3.4")).toBe(false);

        registerFailedLogin("1.2.3.4");
        expect(isIpLoginRateLimited("1.2.3.4")).toBe(true);
    });

    it("azzerare una chiave non tocca il contatore dell'IP né quello degli altri nomi utente", () => {
        for (let attempt = 0; attempt < loginRateLimitMaxAttempts; attempt += 1) {
            registerFailedLogin("1.2.3.4");
            registerFailedLogin("accesso:admin@1.2.3.4");
        }

        registerSuccessfulLogin("accesso:mario@1.2.3.4");

        expect(isLoginRateLimited("accesso:admin@1.2.3.4")).toBe(true);
        expect(isLoginRateLimited("1.2.3.4")).toBe(true);
    });

    // Il caso che conta una volta esposti su internet: senza tetto, ogni IP sorgente
    // diverso lascia una entry in memoria e la mappa cresce finché il processo regge.
    it("tiene limitata la memoria anche con IP sorgente sempre diversi", () => {
        for (let index = 0; index < loginRateLimitMaxEntries + 500; index += 1) {
            registerFailedLogin(`10.0.${Math.floor(index / 256)}.${index % 256}`);
        }

        expect(loginRateLimitSize()).toBeLessThanOrEqual(loginRateLimitMaxEntries);
    });

    it("scartando le entry non perde il blocco appena registrato", () => {
        for (let index = 0; index < loginRateLimitMaxEntries + 500; index += 1) {
            registerFailedLogin(`10.0.${Math.floor(index / 256)}.${index % 256}`);
        }

        const recentIp = "203.0.113.7";
        for (let attempt = 0; attempt < loginRateLimitMaxAttempts; attempt += 1) {
            registerFailedLogin(recentIp);
        }

        expect(isLoginRateLimited(recentIp)).toBe(true);
    });
});
