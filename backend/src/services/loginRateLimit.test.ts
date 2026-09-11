import { beforeEach, describe, expect, it } from "vitest";
import {
    isIpLoginRateLimited,
    isLoginRateLimited,
    loginRateLimitMaxAttempts,
    loginRateLimitMaxAttemptsPerIp,
    loginRateLimitMaxEntries,
    loginRateLimitSize,
    loginRateLimitWindowMs,
    registerFailedLogin,
    registerSuccessfulLogin,
    resetLoginRateLimit,
} from "./loginRateLimit";

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
