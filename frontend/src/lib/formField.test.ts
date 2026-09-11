import { describe, expect, it } from "vitest";
import { fieldErrorAria, fieldErrorId, fieldProps } from "./formField";

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
