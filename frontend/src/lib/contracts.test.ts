import { describe, expect, it } from "vitest";
import type { ContractAssistanceDto, ContractDto } from "@/types/dtos";
import {
    contractEndDate,
    contractStatusColor,
    formatContractPackage,
    formatHours,
    hoursUsageLevel,
    hoursUsagePercent,
    interventionTypesForAssistance,
    explainNoLinkableContract,
    formatContractOption,
    formatPackageHours,
    formatPackagePriority,
    formatPackagePrice,
    isContractLinkable,
    linkableContracts,
} from "./contracts";
import {
    emptyContractFormState,
    toContractCreatePayload,
    toContractSubmitValues,
    toContractUpdatePayload,
    validateContractForm,
} from "./contractForm";

const remote20: ContractAssistanceDto = {
    package: "remote_20",
    name: "Assistenza Remota Pack 20",
    includedHours: 20,
    priceCents: 40000,
    period: "month",
    priority: 4,
    typology: "Teleassistenza, solo software",
};

const supportBase: ContractAssistanceDto = {
    package: "support_base",
    name: "Supporto Base",
    includedHours: 80,
    priceCents: 160000,
    period: "contract",
    priority: 2,
    typology: "Teleassistenza, on site e in laboratorio: hardware, software, formazione",
};

const contract = (overrides: Partial<ContractDto> = {}): ContractDto => ({
    id: 1,
    type: "assistance",
    status: "active",
    effectiveStatus: "active",
    termMonths: 6,
    billingMonths: null,
    device: "NAS",
    note: null,
    startDate: "2026-09-01",
    endDate: "2027-03-01",
    customerId: 3,
    customerName: "Mario Rossi",
    providerId: 8,
    providerName: "Rossi Informatica",
    assistance: remote20,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: null,
    signedContract: null,
    ...overrides,
});

describe("pacchetti", () => {
    it("dice quali tipi di intervento consuma ogni pacchetto", () => {
        expect(interventionTypesForAssistance("remote_20")).toEqual(["remote"]);
        expect(interventionTypesForAssistance("remote_40")).toEqual(["remote"]);
        for (const key of ["ready_20", "ready_40", "ready_60", "support_base", "support_plus"] as const) {
            expect(interventionTypesForAssistance(key)).toEqual(["remote", "customer_site", "lab"]);
        }
        for (const key of [
            "remote_20",
            "remote_40",
            "ready_20",
            "ready_40",
            "ready_60",
            "support_base",
            "support_plus",
        ] as const) {
            expect(interventionTypesForAssistance(key)).not.toContain("material_delivery");
        }
    });
});

describe("formattazione", () => {
    it("scrive le ore all'italiana", () => {
        expect(formatHours(3.5)).toBe("3,5 h");
        expect(formatHours(10)).toBe("10 h");
    });

    it("descrive il pacchetto con il nome del listino", () => {
        expect(formatContractPackage(contract())).toBe("Assistenza Remota Pack 20");
        expect(formatContractPackage(contract({ assistance: supportBase }))).toBe("Supporto Base");
        expect(formatContractPackage(contract({ type: "rental", assistance: null }))).toBe("-");
    });

    it("scrive prezzo, ore e priorità del pacchetto", () => {
        const norm = (text: string) => text.replace(/\s/g, " ");

        expect(norm(formatPackagePrice(remote20))).toBe("400,00 € al mese + IVA");
        // Il punto delle migliaia c'è anche sulle quattro cifre.
        expect(norm(formatPackagePrice(supportBase))).toBe("1.600,00 € + IVA");
        expect(norm(formatPackagePrice({ priceCents: 123000, period: "month" }))).toBe("1.230,00 € al mese + IVA");
        expect(formatPackageHours(remote20)).toBe("20 ore al mese");
        expect(formatPackageHours(supportBase)).toBe("80 ore in 12 mesi");
        expect(formatPackagePriority(1)).toBe("1 (massima)");
        expect(formatPackagePriority(4)).toBe("4");
    });

    it("scrive il contratto nel menu dell'intervento", () => {
        expect(formatContractOption(contract({ id: 4 }))).toBe(
            "#4 Assistenza Remota Pack 20 - NAS (fino al 01/03/2027)"
        );
    });

    it("colora gli stati", () => {
        expect(contractStatusColor("active")).toBe("green");
        expect(contractStatusColor("expired")).toBe("red");
        expect(contractStatusColor("draft")).toBe("yellow");
        expect(contractStatusColor("cancelled")).toBe("red");
    });
});

describe("consumo delle ore", () => {
    it("calcola la percentuale, anche oltre il 100, e nessuna senza ore incluse", () => {
        expect(hoursUsagePercent(5, 10)).toBe(50);
        expect(hoursUsagePercent(15, 10)).toBe(150);
        expect(hoursUsagePercent(5, 0)).toBeNull();
    });

    it("usa le soglie di avviso dell'80% e del 100%", () => {
        expect(hoursUsageLevel(79)).toBe("ok");
        expect(hoursUsageLevel(80)).toBe("warning");
        expect(hoursUsageLevel(99.9)).toBe("warning");
        expect(hoursUsageLevel(100)).toBe("exceeded");
        expect(hoursUsageLevel(null)).toBe("ok");
    });
});

describe("perché nessun contratto si collega", () => {
    const context = { type: "remote" as const, date: "2026-10-05" };

    it("non dice niente se c'è un contratto valido, se non ci sono contratti o la data manca", () => {
        expect(explainNoLinkableContract([contract()], context)).toBeNull();
        expect(explainNoLinkableContract([], context)).toBeNull();
        expect(explainNoLinkableContract([contract()], { ...context, date: "" })).toBeNull();
    });

    it("non dice niente per la consegna di materiale, che non è assistenza", () => {
        expect(explainNoLinkableContract([contract()], { ...context, type: "material_delivery" })).toBeNull();
    });

    it("con un solo contratto adatto al tipo spiega il suo periodo", () => {
        const message = explainNoLinkableContract([contract({ id: 4, startDate: "2026-11-05" })], context);

        expect(message).toContain("Il contratto #4 vale dal 05/11/2026");
        expect(message).toContain("fuori da questo periodo");
    });

    it("se il tipo non è consumato da nessun pacchetto lo dice", () => {
        expect(explainNoLinkableContract([contract()], { ...context, type: "lab" })).toContain("non consuma le ore");
    });

    it("con più contratti adatti ma tutti fuori data dà un messaggio generico", () => {
        const message = explainNoLinkableContract(
            [contract({ id: 1, startDate: "2026-11-05" }), contract({ id: 2, startDate: "2026-12-01" })],
            context
        );

        expect(message).toContain("fuori dal periodo dei contratti");
    });
});

describe("data di fine", () => {
    it("somma i mesi con l'aritmetica di Postgres", () => {
        expect(contractEndDate("2026-11-05", 6)).toBe("2027-05-05");
        expect(contractEndDate("2026-10-01", 12)).toBe("2027-10-01");
        expect(contractEndDate("2026-01-15", 18)).toBe("2027-07-15");
    });

    it("porta al giorno più vicino se il mese di arrivo è più corto", () => {
        expect(contractEndDate("2026-01-31", 1)).toBe("2026-02-28");
        expect(contractEndDate("2026-01-31", 3)).toBe("2026-04-30");
        expect(contractEndDate("2024-01-31", 1)).toBe("2024-02-29");
    });

    it("è null con una data o dei mesi non validi", () => {
        expect(contractEndDate("", 6)).toBeNull();
        expect(contractEndDate("2026-11-05", 0)).toBeNull();
        expect(contractEndDate("2026-11-05", 121)).toBeNull();
        expect(contractEndDate("2026-11-05", Number.NaN)).toBeNull();
    });
});

describe("collegamento a un intervento", () => {
    const context = { type: "remote" as const, date: "2026-10-05" };

    it("accetta un contratto attivo, nel periodo e con un pacchetto che consuma il tipo", () => {
        expect(isContractLinkable(contract(), context)).toBe(true);
    });

    it("la data di fine è esclusa e quella di inizio inclusa", () => {
        expect(isContractLinkable(contract(), { ...context, date: "2026-09-01" })).toBe(true);
        expect(isContractLinkable(contract(), { ...context, date: "2027-03-01" })).toBe(false);
        expect(isContractLinkable(contract(), { ...context, date: "2026-08-31" })).toBe(false);
        expect(isContractLinkable(contract(), { ...context, date: "" })).toBe(false);
    });

    it("scarta noleggi, contratti non attivi e tipi non consumati", () => {
        expect(isContractLinkable(contract({ type: "rental", assistance: null }), context)).toBe(false);
        expect(isContractLinkable(contract({ effectiveStatus: "expired" }), context)).toBe(false);
        expect(isContractLinkable(contract({ effectiveStatus: "draft" }), context)).toBe(false);
        expect(isContractLinkable(contract(), { ...context, type: "lab" })).toBe(false);
        expect(isContractLinkable(contract(), { ...context, type: "material_delivery" })).toBe(false);
    });

    it("tiene il contratto già collegato anche se è scaduto, purché date e tipo tornino", () => {
        const expired = contract({ id: 7, effectiveStatus: "expired" });

        expect(linkableContracts([expired], context)).toEqual([]);
        expect(linkableContracts([expired], context, 7)).toEqual([expired]);
        expect(linkableContracts([expired], { ...context, type: "lab" }, 7)).toEqual([]);
    });
});

describe("modulo del contratto", () => {
    const filled = {
        ...emptyContractFormState("2026-10-05", "Mario Rossi - 333"),
        provider: "Rossi Informatica",
        device: "  NAS  ",
        note: "  ",
    };

    it("parte da un'assistenza con il primo pacchetto del listino", () => {
        expect(emptyContractFormState("2026-10-05")).toMatchObject({
            type: "assistance",
            package: "remote_20",
            termMonths: "12",
        });
    });

    it("segnala tutti i campi mancanti insieme", () => {
        expect(validateContractForm(emptyContractFormState(""))).toEqual({
            customer: "Seleziona un cliente",
            provider: "Seleziona un fornitore",
            startDate: "Seleziona la data di inizio",
            device: "Indica il dispositivo",
        });
    });

    it("il Supporto vuole 12 mesi, un pacchetto mensile no", () => {
        const support = { isSupportPackage: true };

        expect(validateContractForm({ ...filled, package: "support_base", termMonths: "6" }, support).termMonths).toBe(
            "Il pacchetto Supporto dura sempre 12 mesi"
        );
        expect(validateContractForm({ ...filled, package: "support_base", termMonths: "12" }, support)).toEqual({});
        expect(validateContractForm({ ...filled, termMonths: "6" })).toEqual({});
        // Il noleggio non ha pacchetto: la durata è libera.
        expect(validateContractForm({ ...filled, type: "rental", termMonths: "6" }, support)).toEqual({});
    });

    it("costruisce i corpi di creazione e modifica", () => {
        const values = toContractSubmitValues(filled, 3, 8);

        expect(values).toMatchObject({ device: "NAS", note: null, customerId: 3, providerId: 8 });
        expect(toContractCreatePayload(values)).toEqual({
            type: "assistance",
            status: "active",
            termMonths: 12,
            device: "NAS",
            note: null,
            startDate: "2026-10-05",
            customerId: 3,
            providerId: 8,
            assistance: { package: "remote_20" },
        });
        // Il tipo non si cambia: in modifica non viaggia.
        expect(toContractUpdatePayload(values)).not.toHaveProperty("type");
    });

    it("valida la durata e, per il noleggio, il periodo di fatturazione", () => {
        expect(validateContractForm({ ...filled, termMonths: "" }).termMonths).toBeDefined();
        expect(validateContractForm({ ...filled, termMonths: "0" }).termMonths).toBeDefined();
        expect(validateContractForm({ ...filled, termMonths: "121" }).termMonths).toBeDefined();
        expect(validateContractForm({ ...filled, termMonths: "1.5" }).termMonths).toBeDefined();
        expect(validateContractForm({ ...filled, termMonths: "18" })).toEqual({});
        // La fatturazione conta solo per il noleggio.
        expect(validateContractForm({ ...filled, billingMonths: "" })).toEqual({});
        expect(validateContractForm({ ...filled, type: "rental", billingMonths: "" }).billingMonths).toBeDefined();
        expect(validateContractForm({ ...filled, type: "rental", billingMonths: "2" })).toEqual({});
    });

    it("manda il periodo di fatturazione solo per il noleggio", () => {
        const rental = toContractSubmitValues({ ...filled, type: "rental", billingMonths: "2" }, 3, 8);

        expect(rental.billingMonths).toBe(2);
        expect(toContractCreatePayload(rental)).toMatchObject({ type: "rental", billingMonths: 2 });
        expect(toContractCreatePayload(toContractSubmitValues(filled, 3, 8))).not.toHaveProperty("billingMonths");
    });

    it("manda solo la chiave del pacchetto e nessun pacchetto al noleggio", () => {
        const support = toContractSubmitValues({ ...filled, package: "support_plus" }, 3, 8);
        expect(support.assistance).toEqual({ package: "support_plus" });
        expect(toContractCreatePayload(support).assistance).toEqual({ package: "support_plus" });

        const rental = toContractCreatePayload(toContractSubmitValues({ ...filled, type: "rental" }, 3, 8));
        expect(rental).not.toHaveProperty("assistance");
    });
});
