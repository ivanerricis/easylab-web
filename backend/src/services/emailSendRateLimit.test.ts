import { beforeEach, describe, expect, it } from "vitest";
import {
    consumeEmailSendSlot,
    emailSendMaxPerWindow,
    emailSendMaxTrackedUsers,
    emailSendWindowMs,
    resetEmailSendRateLimit,
} from "./emailSendRateLimit";

beforeEach(() => {
    resetEmailSendRateLimit();
});

const sendMany = (userKey: string, count: number, now: number) =>
    Array.from({ length: count }, () => consumeEmailSendSlot(userKey, now));

describe("consumeEmailSendSlot", () => {
    it("ammette gli invii fino al tetto della finestra, poi li rifiuta", () => {
        const now = 1_000_000;

        expect(sendMany("1", emailSendMaxPerWindow, now).every(Boolean)).toBe(true);
        expect(consumeEmailSendSlot("1", now)).toBe(false);
    });

    it("conta ogni utente per conto suo", () => {
        const now = 1_000_000;
        sendMany("1", emailSendMaxPerWindow, now);

        expect(consumeEmailSendSlot("2", now)).toBe(true);
    });

    it("allo scadere della finestra riparte da zero", () => {
        const now = 1_000_000;
        sendMany("1", emailSendMaxPerWindow, now);

        expect(consumeEmailSendSlot("1", now + emailSendWindowMs - 1)).toBe(false);
        expect(consumeEmailSendSlot("1", now + emailSendWindowMs)).toBe(true);
    });

    // Il caso che conta sotto abuso continuo: senza un tetto di memoria, un utente diverso a
    // ogni chiamata (o un userKey falsificato) lascerebbe una entry per sempre. Nessun `now`
    // esplicito: come nel test equivalente di loginRateLimit, l'orario reale (crescente da
    // una chiamata alla successiva) è ciò che rende l'utente registrato per ultimo il più
    // recente agli occhi di `pruneExpiring`, e quindi quello che deve sopravvivere.
    it("tiene limitata la memoria anche con utenti sempre diversi", () => {
        for (let index = 0; index < emailSendMaxTrackedUsers + 500; index += 1) {
            consumeEmailSendSlot(`utente${index}`);
        }

        const recentUser = "utente-recente";

        for (let attempt = 0; attempt < emailSendMaxPerWindow; attempt += 1) {
            consumeEmailSendSlot(recentUser);
        }

        // Se fosse stato scartato insieme alle entry eccedenti, questo invio ripartirebbe da
        // un contatore nuovo invece di trovare il tetto della finestra già esaurito.
        expect(consumeEmailSendSlot(recentUser)).toBe(false);
    });
});
