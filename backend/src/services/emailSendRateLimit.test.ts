import { beforeEach, describe, expect, it } from "vitest";
import {
    consumeEmailSendSlot,
    emailSendMaxPerWindow,
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
});
