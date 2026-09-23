import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "./errors";

const buildAxiosError = (data: unknown, status = 400) => {
    const config = { headers: new AxiosHeaders() };
    return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null, {
        data,
        status,
        statusText: "Bad Request",
        headers: {},
        config,
    });
};

describe("getApiErrorMessage", () => {
    /**
     * È il caso che conta davvero: il backend risponde con { message } e quel testo è già
     * scritto in italiano per l'utente, quindi deve avere la precedenza sul fallback.
     */
    it("preferisce il messaggio restituito dal backend", () => {
        const error = buildAxiosError({ message: "Cliente già esistente" });

        expect(getApiErrorMessage(error, "Fallback")).toBe("Cliente già esistente");
    });

    /**
     * D13: una risposta c'è (es. un 502/524 di Cloudflare a corpo HTML, senza JSON), ma senza
     * un `message` leggibile: meglio il fallback scritto per quel punto dell'app che il testo
     * generico di axios ("Request failed with status code 502"), mai mostrato all'utente.
     */
    it("con una risposta ma senza messaggio usa il fallback, mai il testo di axios", () => {
        const error = buildAxiosError({}, 502);

        expect(getApiErrorMessage(error, "Fallback")).toBe("Fallback");
    });

    it("senza risposta (rete assente) dà un messaggio italiano sulla connessione", () => {
        const config = { headers: new AxiosHeaders() };
        const error = new AxiosError("Network Error", "ERR_NETWORK", config, null, undefined);

        expect(getApiErrorMessage(error, "Fallback")).toBe(
            "Connessione al server non riuscita. Controlla la rete e riprova."
        );
    });

    it("con un timeout dà un messaggio italiano dedicato", () => {
        const config = { headers: new AxiosHeaders() };
        const timeout = new AxiosError("timeout of 5000ms exceeded", "ECONNABORTED", config, null, undefined);

        expect(getApiErrorMessage(timeout, "Fallback")).toBe("Il server non ha risposto in tempo. Riprova.");
    });

    it("usa il messaggio di un Error generico", () => {
        expect(getApiErrorMessage(new Error("rete non raggiungibile"), "Fallback")).toBe("rete non raggiungibile");
    });

    it("usa il fallback per valori lanciati che non sono errori", () => {
        expect(getApiErrorMessage("stringa qualsiasi", "Fallback")).toBe("Fallback");
        expect(getApiErrorMessage(null, "Fallback")).toBe("Fallback");
        expect(getApiErrorMessage(undefined, "Fallback")).toBe("Fallback");
    });

    it("ha un fallback predefinito quando non viene passato", () => {
        expect(getApiErrorMessage(null)).toBe("Operazione non riuscita");
    });
});
