import { describe, expect, it } from "vitest";
import {
    formatAssistanceType,
    formatContractStatus,
    formatContractTerm,
    formatContractType,
    formatHours,
    formatMonthLabel,
} from "./contractLabels";

describe("contractLabels", () => {
    it("traduce il tipo di contratto", () => {
        expect(formatContractType("assistance")).toBe("Assistenza");
        expect(formatContractType("rental")).toBe("Noleggio");
    });

    it("traduce gli stati, compreso quello scaduto", () => {
        expect(formatContractStatus("draft")).toBe("Bozza");
        expect(formatContractStatus("active")).toBe("Attivo");
        expect(formatContractStatus("cancelled")).toBe("Annullato");
        expect(formatContractStatus("expired")).toBe("Scaduto");
    });

    it("traduce la durata", () => {
        expect(formatContractTerm("months_3")).toBe("3 mesi");
        expect(formatContractTerm("months_6")).toBe("6 mesi");
        expect(formatContractTerm("months_12")).toBe("12 mesi");
    });

    it("traduce il tipo di assistenza come la pagina", () => {
        expect(formatAssistanceType("remote")).toBe("Remota");
        expect(formatAssistanceType("on_site")).toBe("In sede o in laboratorio");
        expect(formatAssistanceType("complete")).toBe("Completa");
        expect(formatAssistanceType("full_time")).toBe("Full time");
    });

    it("scrive le ore in italiano con al massimo due decimali", () => {
        expect(formatHours(10)).toBe("10 h");
        expect(formatHours(7.5)).toBe("7,5 h");
        expect(formatHours(0)).toBe("0 h");
        expect(formatHours(1.23456)).toBe("1,23 h");
    });

    it("scrive il mese per esteso", () => {
        expect(formatMonthLabel("2026-10")).toBe("ottobre 2026");
        expect(formatMonthLabel("2027-01")).toBe("gennaio 2027");
    });
});
