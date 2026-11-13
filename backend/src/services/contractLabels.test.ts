import { describe, expect, it } from "vitest";
import {
    formatContractStatus,
    formatContractTerm,
    formatContractType,
    formatHours,
    formatIncludedHours,
    formatMonthLabel,
    formatPackageName,
    formatPackagePrice,
    formatPriority,
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
        expect(formatContractTerm(1)).toBe("1 mese");
        expect(formatContractTerm(3)).toBe("3 mesi");
        expect(formatContractTerm(18)).toBe("18 mesi");
    });

    it("scrive il nome del pacchetto dal listino", () => {
        expect(formatPackageName("remote_20")).toBe("Assistenza Remota Pack 20");
        expect(formatPackageName("ready_60")).toBe("Pronti Via 60");
        expect(formatPackageName("support_plus")).toBe("Supporto Plus");
    });

    it("scrive le ore incluse al mese o in 12 mesi", () => {
        expect(formatIncludedHours(20, "month")).toBe("20 ore al mese");
        expect(formatIncludedHours(80, "contract")).toBe("80 ore in 12 mesi");
    });

    it("scrive il prezzo IVA esclusa, con le migliaia anche a quattro cifre", () => {
        expect(formatPackagePrice(40000, "month")).toBe("400,00 € al mese + IVA");
        expect(formatPackagePrice(123000, "month")).toBe("1.230,00 € al mese + IVA");
        expect(formatPackagePrice(160000, "contract")).toBe("1.600,00 € + IVA");
        expect(formatPackagePrice(250000, "contract")).toBe("2.500,00 € + IVA");
        expect(formatPackagePrice(12345, "contract")).toBe("123,45 € + IVA");
    });

    it("scrive la priorità, massima per la prima", () => {
        expect(formatPriority(1)).toBe("1 (massima)");
        expect(formatPriority(2)).toBe("2");
        expect(formatPriority(4)).toBe("4");
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
