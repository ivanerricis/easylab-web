import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../index";
import { assistanceHoursAlertTable, assistanceTable, assistancePackageHours, assistanceTypes } from "../schema";
import {
    insertAssistanceContract,
    insertContract,
    insertCustomer,
    insertIntervention,
    insertProvider,
} from "../../test/db/fixtures";

/**
 * I vincoli del database sui contratti, provati con scritture dirette: una rotta futura o uno
 * script che aggirasse la validazione della rotta deve trovare comunque il database a
 * rifiutarle. Come in `deleteConstraints.db.test.ts`, si guarda il nome del vincolo violato.
 */
const constraintOf = (error: unknown): string | undefined => {
    const candidate = error as { constraint?: string; cause?: { constraint?: string } };

    return candidate.constraint ?? candidate.cause?.constraint;
};

const violation = async (action: () => Promise<unknown>) => {
    const error = await action().then(
        () => {
            throw new Error("la scrittura doveva essere rifiutata dal database");
        },
        (caught: unknown) => caught
    );

    return constraintOf(error);
};

describe("assistance_package_check", () => {
    const allowed: [string, number | null][] = [
        ["remote", 5],
        ["remote", 10],
        ["remote", 20],
        ["on_site", 10],
        ["on_site", 20],
        ["on_site", 30],
        ["complete", 100],
        ["full_time", null],
    ];

    it.each(allowed)("accetta %s con %s ore", async (assistanceType, includedHours) => {
        const contract = await insertContract({ type: "assistance" });

        await expect(
            db.insert(assistanceTable).values({
                contractId: contract.id,
                assistanceType: assistanceType as never,
                includedHours,
            })
        ).resolves.toBeDefined();
    });

    it.each([
        ["remote", 30],
        ["remote", 100],
        ["remote", null],
        ["on_site", 5],
        ["on_site", null],
        ["complete", 10],
        ["complete", null],
        ["full_time", 100],
        ["full_time", 0],
        ["sconosciuto", 10],
    ])("rifiuta %s con %s ore", async (assistanceType, includedHours) => {
        const contract = await insertContract({ type: "assistance" });

        const constraint = await violation(() =>
            db.insert(assistanceTable).values({
                contractId: contract.id,
                assistanceType: assistanceType as never,
                includedHours,
            })
        );

        expect(constraint).toBe("assistance_package_check");
    });

    it("la tabella esportata in TypeScript coincide con quella accettata dal database", async () => {
        const fromTable = assistanceTypes.flatMap((assistanceType): [string, number | null][] => {
            const hours = assistancePackageHours[assistanceType];

            return hours === null
                ? [[assistanceType, null]]
                : hours.map((value): [string, number] => [assistanceType, value]);
        });

        expect(fromTable).toEqual(allowed);
    });

    it("un aggiornamento fuori pacchetto è rifiutato come l'inserimento", async () => {
        const contract = await insertAssistanceContract({}, { assistanceType: "remote", includedHours: 5 });

        const constraint = await violation(() =>
            db.update(assistanceTable).set({ includedHours: 30 }).where(eq(assistanceTable.contractId, contract.id))
        );

        expect(constraint).toBe("assistance_package_check");
    });
});

describe("disgiunzione fra le specializzazioni", () => {
    it("una riga di assistenza non può appartenere a un contratto di noleggio", async () => {
        const rental = await insertContract({ type: "rental" });

        const constraint = await violation(() =>
            db.insert(assistanceTable).values({ contractId: rental.id, assistanceType: "remote", includedHours: 5 })
        );

        expect(constraint).toBe("assistance_contract_fk");
    });

    it("una riga di assistenza non può avere un tipo di contratto diverso da 'assistance'", async () => {
        const rental = await insertContract({ type: "rental" });

        const constraint = await violation(() =>
            db.insert(assistanceTable).values({
                contractId: rental.id,
                contractType: "rental",
                assistanceType: "remote",
                includedHours: 5,
            })
        );

        expect(constraint).toBe("assistance_contract_type_check");
    });

    it("una riga di assistenza senza contratto è rifiutata", async () => {
        const constraint = await violation(() =>
            db.insert(assistanceTable).values({ contractId: 999, assistanceType: "remote", includedHours: 5 })
        );

        expect(constraint).toBe("assistance_contract_fk");
    });

    it("un contratto non può cambiare tipo se ha già la riga di assistenza", async () => {
        const contract = await insertAssistanceContract();

        const constraint = await violation(() =>
            db.execute(sql`update contract set type = 'rental' where id = ${contract.id}`)
        );

        expect(constraint).toBe("assistance_contract_fk");
    });
});

describe("valori ammessi di tipo, stato e termine", () => {
    it.each([
        ["tipo", { type: "altro" }, "contract_type_check"],
        ["stato", { status: "expired" }, "contract_status_check"],
        ["termine", { term: "months_9" }, "contract_term_check"],
    ])("rifiuta un %s sconosciuto", async (_label, values, expected) => {
        const constraint = await violation(() => insertContract(values as never));

        expect(constraint).toBe(expected);
    });
});

describe("contratto di un altro cliente su un intervento", () => {
    it("accetta un intervento senza contratto e uno con un contratto dello stesso cliente", async () => {
        const customer = await insertCustomer();
        const contract = await insertContract({ customerId: customer.id });

        await expect(insertIntervention({ customerId: customer.id })).resolves.toMatchObject({ contractId: null });
        await expect(insertIntervention({ customerId: customer.id, contractId: contract.id })).resolves.toMatchObject({
            contractId: contract.id,
        });
    });

    it("rifiuta un intervento che punta al contratto di un altro cliente", async () => {
        const contract = await insertContract();
        const other = await insertCustomer();

        const constraint = await violation(() => insertIntervention({ customerId: other.id, contractId: contract.id }));

        expect(constraint).toBe("intervention_customer_contract_fk");
    });

    it("rifiuta un intervento che punta a un contratto inesistente", async () => {
        const constraint = await violation(() => insertIntervention({ contractId: 999 }));

        expect(constraint).toBe("intervention_customer_contract_fk");
    });

    it("accetta il nuovo tipo di intervento 'lab' e rifiuta uno sconosciuto", async () => {
        await expect(insertIntervention({ type: "lab" })).resolves.toMatchObject({ type: "lab" });

        const constraint = await violation(() => insertIntervention({ type: "altro" as never }));

        expect(constraint).toBe("intervention_type_check");
    });
});

describe("fornitore", () => {
    it("il nome è unico senza distinguere le maiuscole", async () => {
        await insertProvider({ providerName: "Acme Srl" });

        expect(await violation(() => insertProvider({ providerName: "ACME srl" }))).toBe(
            "provider_provider_name_lower_idx"
        );
    });

    it("email e telefono sono unici", async () => {
        await insertProvider({ email: "a@acme.it", phoneNumber: "0211111111" });

        expect(await violation(() => insertProvider({ email: "a@acme.it" }))).toBe("provider_email_unique");
        expect(await violation(() => insertProvider({ phoneNumber: "0211111111" }))).toBe(
            "provider_phone_number_unique"
        );
    });
});

describe("avvisi di ore", () => {
    it("un avviso per contratto, mese e tipo", async () => {
        const contract = await insertAssistanceContract();
        const alert = { contractId: contract.id, month: "2026-10-01", kind: "warning" as const };

        await db.insert(assistanceHoursAlertTable).values(alert);

        expect(await violation(() => db.insert(assistanceHoursAlertTable).values(alert))).toBe(
            "assistance_hours_alert_contract_id_month_kind_pk"
        );
        await expect(
            db.insert(assistanceHoursAlertTable).values({ ...alert, kind: "exhausted" })
        ).resolves.toBeDefined();
    });

    it("rifiuta un tipo di avviso sconosciuto e un avviso su un contratto senza assistenza", async () => {
        const contract = await insertAssistanceContract();
        const rental = await insertContract();

        expect(
            await violation(() =>
                db
                    .insert(assistanceHoursAlertTable)
                    .values({ contractId: contract.id, month: "2026-10-01", kind: "altro" as never })
            )
        ).toBe("assistance_hours_alert_kind_check");
        expect(
            await violation(() =>
                db
                    .insert(assistanceHoursAlertTable)
                    .values({ contractId: rental.id, month: "2026-10-01", kind: "warning" })
            )
        ).toBe("assistance_hours_alert_contract_id_assistance_contract_id_fk");
    });
});
