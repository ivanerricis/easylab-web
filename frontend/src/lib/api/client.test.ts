import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, setUnauthorizedHandler } from "./client";

const buildError = (status: number, url: string) => {
    const config = { headers: new AxiosHeaders(), url };

    return new AxiosError("Request failed", `ERR_${status}`, config, null, {
        data: { message: "boom" },
        status,
        statusText: "",
        headers: {},
        config,
    });
};

/**
 * Il ramo di rifiuto dell'interceptor registrato da `client.ts`: axios lo tiene in un array
 * non tipato pubblicamente, ma è lì che vive la logica da testare — non c'è altro modo di
 * invocarla senza un adattatore HTTP finto.
 */
const rejectedInterceptor = () => {
    const handlers = (
        api.interceptors.response as unknown as {
            handlers: ({ rejected: (error: unknown) => unknown } | null)[];
        }
    ).handlers;
    const last = handlers[handlers.length - 1];

    if (!last) {
        throw new Error("Nessun interceptor di risposta registrato");
    }

    return last.rejected;
};

describe("interceptor di risposta", () => {
    beforeEach(() => {
        setUnauthorizedHandler(null);
    });

    it("avvisa l'handler registrato su un 401 fuori da /auth/", async () => {
        const handler = vi.fn();
        setUnauthorizedHandler(handler);

        await expect(rejectedInterceptor()(buildError(401, "/reports/5"))).rejects.toBeInstanceOf(AxiosError);

        expect(handler).toHaveBeenCalledTimes(1);
    });

    /**
     * Login con password sbagliata, verifica 2FA con codice sbagliato, `/auth/me` prima di
     * entrare: rispondono 401 anche a sessione valida (o meglio, prima che ce ne sia una).
     * Non è una sessione scaduta da qualcun altro: lo gestisce già chi le chiama.
     */
    it("non avvisa per un 401 da una rotta /auth/", async () => {
        const handler = vi.fn();
        setUnauthorizedHandler(handler);

        for (const url of ["/auth/login", "/auth/login/2fa", "/auth/me"]) {
            await expect(rejectedInterceptor()(buildError(401, url))).rejects.toBeInstanceOf(AxiosError);
        }

        expect(handler).not.toHaveBeenCalled();
    });

    it("non avvisa per un errore diverso da 401", async () => {
        const handler = vi.fn();
        setUnauthorizedHandler(handler);

        await expect(rejectedInterceptor()(buildError(500, "/reports/5"))).rejects.toBeInstanceOf(AxiosError);

        expect(handler).not.toHaveBeenCalled();
    });

    // L'interceptor non mostra un proprio toast: l'unico avviso resta quello di chi ha
    // chiamato la richiesta (il suo `catch`), altrimenti un 401 ne mostrerebbe due.
    it("non lancia e non fa niente senza un handler registrato", async () => {
        await expect(rejectedInterceptor()(buildError(401, "/reports/5"))).rejects.toBeInstanceOf(AxiosError);
    });

    it("lascia comunque passare l'errore a chi ha fatto la richiesta", async () => {
        const error = buildError(401, "/reports/5");

        await expect(rejectedInterceptor()(error)).rejects.toBe(error);
    });
});
