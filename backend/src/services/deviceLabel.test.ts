import { describe, expect, it } from "vitest";
import { describeUserAgent, sanitizeUserAgent } from "./deviceLabel";

describe("describeUserAgent", () => {
    // Stringhe reali: è l'unico modo per accorgersi che ogni Chromium dice anche "Safari" e
    // ogni derivato di Chrome dice anche "Chrome".
    const cases: [string, string][] = [
        [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
            "Chrome su Windows",
        ],
        [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
            "Edge su Windows",
        ],
        [
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
            "Safari su Mac",
        ],
        [
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
            "Safari su iPhone",
        ],
        [
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
            "Chrome su iPhone",
        ],
        [
            "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
            "Samsung Internet su Android",
        ],
        [
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
            "Chrome su Android",
        ],
        ["Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0", "Firefox su Linux"],
    ];

    it.each(cases)("riconosce %s", (userAgent, expected) => {
        expect(describeUserAgent(userAgent)).toBe(expected);
    });

    it("si accontenta di quello che riconosce", () => {
        expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
        expect(describeUserAgent("curl/8.7.1")).toBeNull();
    });

    /** Le sessioni aperte prima che l'header venisse salvato hanno la colonna a null. */
    it("resta null quando non c'è l'header", () => {
        expect(describeUserAgent(null)).toBeNull();
        expect(describeUserAgent(undefined)).toBeNull();
        expect(describeUserAgent("")).toBeNull();
    });
});

describe("sanitizeUserAgent", () => {
    it("toglie i caratteri di controllo e taglia alla lunghezza della colonna", () => {
        expect(sanitizeUserAgent("Mozilla/5.0\n(Windows NT 10.0)")).toBe("Mozilla/5.0 (Windows NT 10.0)");
        expect(sanitizeUserAgent("x".repeat(400))).toHaveLength(255);
    });

    it("tratta come assente un header vuoto o fatto di soli spazi", () => {
        expect(sanitizeUserAgent("   ")).toBeNull();
        expect(sanitizeUserAgent(undefined)).toBeNull();
    });
});
