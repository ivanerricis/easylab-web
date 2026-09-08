import { beforeEach, describe, expect, it } from "vitest";
import {
    createTwoFactorChallenge,
    deleteTwoFactorChallenge,
    getTwoFactorChallengeUserId,
    registerFailedTwoFactorAttempt,
    resetTwoFactorChallenges,
    twoFactorChallengeMaxAttempts,
    twoFactorChallengeMaxEntries,
    twoFactorChallengeSize,
    twoFactorChallengeTtlMs,
} from "./twoFactorChallenge";

describe("twoFactorChallenge", () => {
    beforeEach(() => {
        resetTwoFactorChallenges();
    });

    it("restituisce l'utente a cui appartiene il challenge", () => {
        const challengeId = createTwoFactorChallenge(7);

        expect(getTwoFactorChallengeUserId(challengeId)).toBe(7);
    });

    // Indovinare un challenge altrui significherebbe saltare il secondo fattore di quella
    // persona: l'id deve essere imprevedibile, non un contatore.
    it("genera id diversi e non riconosce quelli inventati", () => {
        const first = createTwoFactorChallenge(1);
        const second = createTwoFactorChallenge(1);

        expect(first).not.toBe(second);
        expect(getTwoFactorChallengeUserId("00".repeat(32))).toBeNull();
    });

    it("dimentica il challenge una volta scaduto", () => {
        const now = Date.now();
        const challengeId = createTwoFactorChallenge(7, now);

        expect(getTwoFactorChallengeUserId(challengeId, now + twoFactorChallengeTtlMs - 1)).toBe(7);
        expect(getTwoFactorChallengeUserId(challengeId, now + twoFactorChallengeTtlMs)).toBeNull();
    });

    // Il punto del tetto ai tentativi: un codice a sei cifre è un milione di combinazioni,
    // che si esauriscono in fretta se si può continuare a provare sullo stesso challenge.
    it("brucia il challenge dopo i tentativi previsti", () => {
        const challengeId = createTwoFactorChallenge(7);

        for (let attempt = 0; attempt < twoFactorChallengeMaxAttempts - 1; attempt += 1) {
            expect(registerFailedTwoFactorAttempt(challengeId)).toBe(true);
        }

        expect(registerFailedTwoFactorAttempt(challengeId)).toBe(false);
        expect(getTwoFactorChallengeUserId(challengeId)).toBeNull();
    });

    it("segnala come esaurito anche un challenge che non esiste", () => {
        expect(registerFailedTwoFactorAttempt("00".repeat(32))).toBe(false);
    });

    it("non fa scadere il challenge di un altro utente insieme a quello sbagliato", () => {
        const mine = createTwoFactorChallenge(1);
        const other = createTwoFactorChallenge(2);

        for (let attempt = 0; attempt < twoFactorChallengeMaxAttempts; attempt += 1) {
            registerFailedTwoFactorAttempt(mine);
        }

        expect(getTwoFactorChallengeUserId(other)).toBe(2);
    });

    it("elimina il challenge quando ha esaurito il suo scopo", () => {
        const challengeId = createTwoFactorChallenge(7);

        deleteTwoFactorChallenge(challengeId);

        expect(getTwoFactorChallengeUserId(challengeId)).toBeNull();
        expect(twoFactorChallengeSize()).toBe(0);
    });

    // Creare un challenge costa una password valida, ma la memoria non deve comunque
    // crescere senza limite: stesso tetto e stessa potatura del limitatore per IP.
    it("tiene limitata la memoria e non perde il challenge appena creato", () => {
        for (let index = 0; index < twoFactorChallengeMaxEntries + 500; index += 1) {
            createTwoFactorChallenge(index);
        }

        const latest = createTwoFactorChallenge(999);

        expect(twoFactorChallengeSize()).toBeLessThanOrEqual(twoFactorChallengeMaxEntries);
        expect(getTwoFactorChallengeUserId(latest)).toBe(999);
    });
});
