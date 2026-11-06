import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { auditAs, describeSubject, readAuditContext, setAuditSubject } from "./auditContext";

const createResponse = () => ({ locals: {} }) as unknown as Response;

describe("describeSubject", () => {
    it("scrive l'ID e il nome", () => {
        expect(describeSubject(7, "Mario", "Rossi")).toBe("#7 Mario Rossi");
    });

    it("salta le parti mancanti e, senza nome, resta l'ID", () => {
        expect(describeSubject(7, "Mario", null)).toBe("#7 Mario");
        expect(describeSubject(7, null, undefined)).toBe("#7");
    });

    it("toglie `|` e a capo, che nel registro separano i campi e le righe", () => {
        expect(describeSubject(3, "A | B\nC")).toBe("#3 A / B C");
    });

    it("accorcia un nome lungo ma lascia intero l'ID", () => {
        const subject = describeSubject(12, "x".repeat(300));

        expect(subject.startsWith("#12 ")).toBe(true);
        expect(subject.length).toBeLessThan(90);
        expect(subject.endsWith("…")).toBe(true);
    });
});

describe("auditAs e setAuditSubject", () => {
    it("lasciano l'etichetta e il soggetto dove il registro li legge", () => {
        const response = createResponse();
        const next = vi.fn() as NextFunction;

        auditAs("eliminato cliente")({} as Request, response, next);
        setAuditSubject(response, "#7 Mario Rossi");

        expect(next).toHaveBeenCalledOnce();
        expect(readAuditContext(response)).toEqual({ action: "eliminato cliente", subject: "#7 Mario Rossi" });
    });

    it("senza dichiarazioni il registro non trova niente", () => {
        expect(readAuditContext(createResponse())).toEqual({ action: null, subject: null });
    });
});
