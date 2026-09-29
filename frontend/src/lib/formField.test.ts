import { afterEach, describe, expect, it, vi } from "vitest";
import { fieldErrorAria, fieldErrorId, fieldProps, reportFieldErrors } from "./formField";

describe("fieldProps", () => {
    it("senza errore non aggiunge attributi aria", () => {
        expect(fieldProps("firstName")).toEqual({
            id: "firstName",
            "aria-invalid": undefined,
            "aria-describedby": undefined,
            "aria-required": undefined,
        });
    });

    it("con un errore marca il campo e lo collega al messaggio", () => {
        expect(fieldProps("firstName", { error: "Obbligatorio", required: true })).toEqual({
            id: "firstName",
            "aria-invalid": true,
            "aria-describedby": fieldErrorId("firstName"),
            "aria-required": true,
        });
    });

    it("fieldErrorAria usa la stessa convenzione di id", () => {
        expect(fieldErrorAria("date", "Obbligatoria")).toEqual({
            "aria-invalid": true,
            "aria-describedby": "date-error",
        });
        expect(fieldErrorAria("date")).toEqual({ "aria-invalid": undefined, "aria-describedby": undefined });
    });
});

describe("reportFieldErrors", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    /** Due campi veri nella pagina, per vedere dove finisce il focus. */
    const renderFields = (...ids: string[]) => {
        for (const id of ids) {
            const input = document.createElement("input");
            input.id = id;
            document.body.append(input);
        }
    };

    it("senza errori li azzera comunque e restituisce falso", () => {
        const setErrors = vi.fn();

        expect(reportFieldErrors({}, ["host", "port"], setErrors)).toBe(false);
        // Anche vuoti: un nuovo tentativo riuscito deve togliere i messaggi del precedente.
        expect(setErrors).toHaveBeenCalledWith({});
    });

    it("mette a fuoco il primo campo sbagliato secondo l'ordine dato, non quello dell'oggetto", () => {
        renderFields("host", "port");
        const setErrors = vi.fn();
        const nextErrors = { port: "Porta non valida", host: "Host obbligatorio" };

        expect(reportFieldErrors(nextErrors, ["host", "port"], setErrors)).toBe(true);
        expect(setErrors).toHaveBeenCalledWith(nextErrors);
        expect(document.activeElement?.id).toBe("host");
    });

    it("ignora i campi senza messaggio", () => {
        renderFields("host", "port");

        expect(reportFieldErrors({ host: undefined, port: "Porta non valida" }, ["host", "port"], vi.fn())).toBe(true);
        expect(document.activeElement?.id).toBe("port");
    });

    it("usa la funzione di focus data, per i dialoghi che prima devono aprire il passo giusto", () => {
        const focusField = vi.fn();

        reportFieldErrors({ port: "Porta non valida" }, ["host", "port"], vi.fn(), focusField);
        expect(focusField).toHaveBeenCalledExactlyOnceWith("port");
    });
});
