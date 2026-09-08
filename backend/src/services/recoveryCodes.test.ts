import { describe, expect, it } from "vitest";
import {
    generateRecoveryCodes,
    hashRecoveryCode,
    looksLikeRecoveryCode,
    normalizeRecoveryCode,
    recoveryCodeCount,
} from "./recoveryCodes";

describe("generateRecoveryCodes", () => {
    it("ne genera otto nel formato xxxx-xxxx", () => {
        const codes = generateRecoveryCodes();

        expect(codes).toHaveLength(recoveryCodeCount);
        for (const code of codes) {
            expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
        }
    });

    // Un blocco con due codici uguali darebbe all'utente sette possibilità invece di otto,
    // e il duplicato sarebbe respinto dal vincolo di unicità o consumato due volte.
    it("non ripete lo stesso codice dentro un blocco", () => {
        const codes = generateRecoveryCodes(50);

        expect(new Set(codes).size).toBe(codes.length);
    });

    // I caratteri ambigui sono esclusi apposta: questi codici si leggono da un foglio
    // stampato, dove 0/O e 1/I sono indistinguibili. La L maiuscola resta, come
    // nell'alfabeto delle password generate: è la minuscola a confondersi con l'uno.
    it("non usa caratteri ambigui", () => {
        const joined = generateRecoveryCodes(50).join("");

        expect(joined).not.toMatch(/[01OI]/);
    });
});

describe("normalizeRecoveryCode", () => {
    // Il codice arriva come è stato ricopiato a mano: rifiutarlo per un trattino mancante
    // significherebbe bloccare fuori proprio chi sta già usando la via di emergenza.
    it("ignora maiuscole, trattini e spazi", () => {
        expect(normalizeRecoveryCode("ab2c-d3ef")).toBe("AB2CD3EF");
        expect(normalizeRecoveryCode(" AB2C D3EF ")).toBe("AB2CD3EF");
        expect(normalizeRecoveryCode("AB2CD3EF")).toBe("AB2CD3EF");
    });
});

describe("hashRecoveryCode", () => {
    it("dà lo stesso hash per le diverse trascrizioni dello stesso codice", () => {
        expect(hashRecoveryCode("ab2c-d3ef")).toBe(hashRecoveryCode("AB2CD3EF"));
    });

    it("dà hash diversi per codici diversi", () => {
        expect(hashRecoveryCode("AB2C-D3EF")).not.toBe(hashRecoveryCode("AB2C-D3EG"));
    });

    it("restituisce i 64 caratteri di uno sha256, quanti ne prevede la colonna", () => {
        expect(hashRecoveryCode("AB2C-D3EF")).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("looksLikeRecoveryCode", () => {
    // È il discriminante che la rotta di login usa per decidere se cercare un codice di
    // recupero o verificare un TOTP: un codice a sei cifre non deve mai finire nel ramo
    // sbagliato, e viceversa.
    it("distingue un codice di recupero da un codice TOTP", () => {
        expect(looksLikeRecoveryCode("AB2C-D3EF")).toBe(true);
        expect(looksLikeRecoveryCode("ab2cd3ef")).toBe(true);
        expect(looksLikeRecoveryCode("123456")).toBe(false);
    });

    it("rifiuta lunghezze sbagliate e caratteri fuori alfabeto", () => {
        expect(looksLikeRecoveryCode("AB2C-D3E")).toBe(false);
        expect(looksLikeRecoveryCode("AB2C-D3EFG")).toBe(false);
        expect(looksLikeRecoveryCode("AB0C-D1EF")).toBe(false);
        expect(looksLikeRecoveryCode("")).toBe(false);
    });

    it("considera validi tutti i codici che genera", () => {
        for (const code of generateRecoveryCodes(50)) {
            expect(looksLikeRecoveryCode(code)).toBe(true);
        }
    });
});
