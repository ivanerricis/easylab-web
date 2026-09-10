import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { NextFunction, Request, Response } from "express";
import { requestLogger } from "./requestLogger";

// `response.once("finish", ...)` è il punto in cui il middleware scrive il log: senza un
// EventEmitter vero non c'è modo di farlo scattare da fuori.
const createResponse = (statusCode: number) => {
    const emitter = new EventEmitter() as unknown as Response & EventEmitter;
    (emitter as unknown as { statusCode: number }).statusCode = statusCode;
    return emitter;
};

const createRequest = (method: string, originalUrl: string) => ({ method, originalUrl }) as Request;

describe("requestLogger", () => {
    beforeEach(() => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("registra una richiesta API riuscita su console.log", () => {
        const next = vi.fn();
        const res = createResponse(200);

        requestLogger(createRequest("GET", "/api/devices"), res, next as NextFunction);
        res.emit("finish");

        expect(next).toHaveBeenCalledOnce();
        expect(console.log).toHaveBeenCalledOnce();
        expect(vi.mocked(console.log).mock.calls[0][0]).toContain("path=/api/devices");
    });

    it("registra su console.error una risposta 5xx", () => {
        const res = createResponse(500);

        requestLogger(createRequest("GET", "/api/devices"), res, vi.fn() as NextFunction);
        res.emit("finish");

        expect(console.error).toHaveBeenCalledOnce();
        expect(console.log).not.toHaveBeenCalled();
    });

    it("ignora le rotte che non iniziano per /api", () => {
        const res = createResponse(200);

        requestLogger(createRequest("GET", "/health"), res, vi.fn() as NextFunction);
        res.emit("finish");

        expect(console.log).not.toHaveBeenCalled();
    });

    it("ignora /api/health, interrogata di continuo dall'healthcheck", () => {
        const res = createResponse(200);

        requestLogger(createRequest("GET", "/api/health"), res, vi.fn() as NextFunction);
        res.emit("finish");

        expect(console.log).not.toHaveBeenCalled();
    });

    it("ignora /api/settings/update-state, interrogata a ripetizione dal frontend", () => {
        const res = createResponse(200);

        requestLogger(createRequest("GET", "/api/settings/update-state"), res, vi.fn() as NextFunction);
        res.emit("finish");

        expect(console.log).not.toHaveBeenCalled();
    });

    it("spoglia la query string dal path registrato", () => {
        const res = createResponse(200);

        requestLogger(createRequest("GET", "/api/devices?page=2"), res, vi.fn() as NextFunction);
        res.emit("finish");

        expect(vi.mocked(console.log).mock.calls[0][0]).toContain("path=/api/devices ");
        expect(vi.mocked(console.log).mock.calls[0][0]).not.toContain("page=2");
    });

    it("segna slow=true solo oltre la soglia di durata", () => {
        const hrtime = vi.spyOn(process.hrtime, "bigint").mockReturnValueOnce(0n).mockReturnValueOnce(1_200_000_000n); // 1200ms dopo, in nanosecondi

        const res = createResponse(200);

        requestLogger(createRequest("GET", "/api/devices"), res, vi.fn() as NextFunction);
        res.emit("finish");

        expect(vi.mocked(console.log).mock.calls[0][0]).toContain("slow=true");
        hrtime.mockRestore();
    });

    it("non segna slow=true sotto la soglia", () => {
        const hrtime = vi.spyOn(process.hrtime, "bigint").mockReturnValueOnce(0n).mockReturnValueOnce(50_000_000n); // 50ms dopo

        const res = createResponse(200);

        requestLogger(createRequest("GET", "/api/devices"), res, vi.fn() as NextFunction);
        res.emit("finish");

        expect(vi.mocked(console.log).mock.calls[0][0]).not.toContain("slow=true");
        hrtime.mockRestore();
    });
});
