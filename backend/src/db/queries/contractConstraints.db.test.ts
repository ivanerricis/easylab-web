import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, pool } from "../index";
import { assistanceHoursAlertTable, assistanceTable, assistancePackageKeys } from "../schema";
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

const codeOf = (error: unknown): string | undefined => {
    const candidate = error as { code?: string; cause?: { code?: string } };

    return candidate.code ?? candidate.cause?.code;
};

describe("assistance_package_check", () => {
    it.each(assistancePackageKeys)("accetta il pacchetto %s", async (key) => {
        const contract = await insertContract({ type: "assistance" });

        await expect(
            db.insert(assistanceTable).values({
                contractId: contract.id,
                package: key,
                includedHours: 20,
                priceCents: 40000,
            })
        ).resolves.toBeDefined();
    });

    it.each(["remote", "on_site", "complete", "full_time", "sconosciuto", "remote_30"])(
        "rifiuta la chiave %s",
        async (key) => {
            const contract = await insertContract({ type: "assistance" });

            const constraint = await violation(() =>
                db.insert(assistanceTable).values({
                    contractId: contract.id,
                    package: key as never,
                    includedHours: 20,
                    priceCents: 40000,
                })
            );

            expect(constraint).toBe("assistance_package_check");
        }
    );

    it("un aggiornamento a una chiave fuori listino è rifiutato come l'inserimento", async () => {
        const contract = await insertAssistanceContract();

        const constraint = await violation(() =>
            db
                .update(assistanceTable)
                .set({ package: "full_time" as never })
                .where(eq(assistanceTable.contractId, contract.id))
        );

        expect(constraint).toBe("assistance_package_check");
    });

    it("la lista TypeScript delle chiavi coincide con quella accettata dal database", async () => {
        const { rows } = await pool.query(
            "select pg_get_constraintdef(oid) as definition from pg_constraint where conname = 'assistance_package_check'"
        );

        for (const key of assistancePackageKeys) {
            expect(rows[0].definition).toContain(`'${key}'`);
        }

        expect(rows[0].definition.match(/'[a-z_0-9]+'::character varying/g)).toHaveLength(assistancePackageKeys.length);
    });
});

describe("ore e prezzo del pacchetto", () => {
    it("sono uno snapshot: nessun CHECK le lega al pacchetto, quindi ore e prezzo diversi dal listino sono accettati", async () => {
        const contract = await insertContract({ type: "assistance" });

        await expect(
            db.insert(assistanceTable).values({
                contractId: contract.id,
                package: "remote_20",
                includedHours: 35,
                priceCents: 12345,
            })
        ).resolves.toBeDefined();
    });

    it.each([0, -5])("le ore %s sono rifiutate", async (hours) => {
        const contract = await insertContract({ type: "assistance" });

        const constraint = await violation(() =>
            db.insert(assistanceTable).values({
                contractId: contract.id,
                package: "ready_20",
                includedHours: hours,
                priceCents: 50000,
            })
        );

        expect(constraint).toBe("assistance_included_hours_check");
    });

    it.each([0, -1])("il prezzo %s è rifiutato", async (priceCents) => {
        const contract = await insertContract({ type: "assistance" });

        const constraint = await violation(() =>
            db.insert(assistanceTable).values({
                contractId: contract.id,
                package: "ready_20",
                includedHours: 20,
                priceCents,
            })
        );

        expect(constraint).toBe("assistance_price_cents_check");
    });

    it("ore e prezzo sono obbligatori (niente più ore illimitate)", async () => {
        const contract = await insertContract({ type: "assistance" });

        for (const missing of [
            { includedHours: null, priceCents: 50000 },
            { includedHours: 20, priceCents: null },
        ]) {
            const caught = await db
                .insert(assistanceTable)
                .values({ contractId: contract.id, package: "ready_20", ...missing } as never)
                .then(
                    () => undefined,
                    (error: unknown) => error
                );

            // Un NOT NULL non ha un nome di vincolo da confrontare: si guarda il codice SQLSTATE.
            expect(codeOf(caught)).toBe("23502");
        }
    });
});

describe("disgiunzione fra le specializzazioni", () => {
    it("una riga di assistenza non può appartenere a un contratto di noleggio", async () => {
        const rental = await insertContract({ type: "rental" });

        const constraint = await violation(() =>
            db
                .insert(assistanceTable)
                .values({ contractId: rental.id, package: "remote_20", includedHours: 20, priceCents: 40000 })
        );

        expect(constraint).toBe("assistance_contract_fk");
    });

    it("una riga di assistenza non può avere un tipo di contratto diverso da 'assistance'", async () => {
        const rental = await insertContract({ type: "rental" });

        const constraint = await violation(() =>
            db.insert(assistanceTable).values({
                contractId: rental.id,
                contractType: "rental",
                package: "remote_20",
                includedHours: 20,
                priceCents: 40000,
            })
        );

        expect(constraint).toBe("assistance_contract_type_check");
    });

    it("una riga di assistenza senza contratto è rifiutata", async () => {
        const constraint = await violation(() =>
            db
                .insert(assistanceTable)
                .values({ contractId: 999, package: "remote_20", includedHours: 20, priceCents: 40000 })
        );

        expect(constraint).toBe("assistance_contract_fk");
    });

    it("un contratto non può cambiare tipo se ha già la riga di assistenza", async () => {
        const contract = await insertAssistanceContract();

        const constraint = await violation(() =>
            db.execute(sql`update contract set type = 'rental', billing_months = 3 where id = ${contract.id}`)
        );

        expect(constraint).toBe("assistance_contract_fk");
    });
});

describe("valori ammessi di tipo, stato e termine", () => {
    it.each([
        ["tipo", { type: "altro" }, "contract_type_check"],
        ["stato", { status: "expired" }, "contract_status_check"],
        ["termine a zero mesi", { termMonths: 0 }, "contract_term_months_check"],
        ["termine oltre 120 mesi", { termMonths: 121 }, "contract_term_months_check"],
        [
            "noleggio senza periodo di fatturazione",
            { type: "rental", billingMonths: null },
            "contract_billing_months_check",
        ],
        [
            "assistenza con periodo di fatturazione",
            { type: "assistance", billingMonths: 3 },
            "contract_billing_months_check",
        ],
        ["fatturazione oltre 120 mesi", { type: "rental", billingMonths: 121 }, "contract_billing_months_check"],
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
