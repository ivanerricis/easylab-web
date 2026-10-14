import { describe, expect, it } from "vitest";
import { pool } from "../index";
import {
    insertAssistanceContract,
    insertContract,
    insertCustomer,
    insertIntervention,
    insertProvider,
} from "../../test/db/fixtures";
import {
    createContract,
    deleteContractById,
    getContractById,
    hasLinkedInterventions,
    listContracts,
    updateContractById,
} from "./contract";
import { currentLocalDay } from "./timeZone";

const timeZone = "UTC";

type ListParams = Parameters<typeof listContracts>[0];

const findIds = async (params: Partial<ListParams>) => {
    const result = await listContracts({ page: 1, pageSize: 100, timeZone, sortBy: "startDate", ...params });

    if (Array.isArray(result)) {
        throw new Error("attesa una lista paginata");
    }

    return result.items.map((item) => item.id);
};

const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

/** Un giorno relativo a oggi, calcolato da Postgres così l'aritmetica sui mesi è la sua. */
const shiftToday = async (interval: string, zone = timeZone) => {
    const { rows } = await pool.query<{ day: string }>("select to_char($1::date + $2::interval, 'YYYY-MM-DD') as day", [
        currentLocalDay(zone),
        interval,
    ]);

    return rows[0].day;
};

describe("contratti: data di fine e stato effettivo", () => {
    it.each([
        ["months_3", "2026-01-31", "2026-04-30"],
        ["months_6", "2026-03-15", "2026-09-15"],
        ["months_12", "2026-10-01", "2027-10-01"],
    ] as const)("il termine %s da %s finisce il %s", async (term, startDate, endDate) => {
        const contract = await insertContract({ term, startDate });

        const [row] = await getContractById(contract.id, timeZone);

        expect(row.endDate).toBe(endDate);
    });

    it("un contratto attivo con la fine passata risulta scaduto, ma resta attivo nel database", async () => {
        const expired = await insertContract({ status: "active", term: "months_3", startDate: "2020-01-01" });

        const [row] = await getContractById(expired.id, timeZone);

        expect(row.status).toBe("active");
        expect(row.effectiveStatus).toBe("expired");
    });

    it("il giorno di fine stesso il contratto è già scaduto, il giorno prima no", async () => {
        const endsToday = await insertContract({
            status: "active",
            term: "months_3",
            startDate: await shiftToday("-3 months"),
        });
        const endsTomorrow = await insertContract({
            status: "active",
            term: "months_3",
            startDate: await shiftToday("-3 months + 1 day"),
        });

        const [today] = await getContractById(endsToday.id, timeZone);
        const [tomorrow] = await getContractById(endsTomorrow.id, timeZone);

        expect(today.effectiveStatus).toBe("expired");
        expect(tomorrow.effectiveStatus).toBe("active");
    });

    it("bozze e annullati non scadono mai", async () => {
        const draft = await insertContract({ status: "draft", startDate: "2020-01-01" });
        const cancelled = await insertContract({ status: "cancelled", startDate: "2020-01-01" });

        expect((await getContractById(draft.id, timeZone))[0].effectiveStatus).toBe("draft");
        expect((await getContractById(cancelled.id, timeZone))[0].effectiveStatus).toBe("cancelled");
    });

    it("il giorno corrente è quello del fuso del laboratorio, non quello del server", async () => {
        // Due fusi lontani 25 ore hanno sempre date di calendario diverse. Un contratto che
        // finisce "oggi" nel fuso più a oriente è scaduto lì, ma non lo è ancora nell'altro.
        const contract = await insertContract({
            status: "active",
            term: "months_12",
            startDate: await shiftToday("-12 months", "Pacific/Kiritimati"),
        });

        const [east] = await getContractById(contract.id, "Pacific/Kiritimati");
        const [west] = await getContractById(contract.id, "Pacific/Pago_Pago");

        expect(east.effectiveStatus).toBe("expired");
        expect(west.effectiveStatus).toBe("active");
    });
});

describe("listContracts: filtri", () => {
    it("filtra per stato effettivo: expired, active, draft, cancelled", async () => {
        const expired = await insertContract({ status: "active", term: "months_3", startDate: "2020-01-01" });
        const active = await insertContract({
            status: "active",
            term: "months_12",
            startDate: await shiftToday("-1 day"),
        });
        const draft = await insertContract({ status: "draft" });
        const cancelled = await insertContract({ status: "cancelled" });

        expect(await findIds({ status: "expired" })).toEqual([expired.id]);
        expect(await findIds({ status: "active" })).toEqual([active.id]);
        expect(await findIds({ status: "draft" })).toEqual([draft.id]);
        expect(await findIds({ status: "cancelled" })).toEqual([cancelled.id]);
        expect(sorted(await findIds({ status: "all" }))).toEqual(
            sorted([expired.id, active.id, draft.id, cancelled.id])
        );
    });

    it("filtra per tipo", async () => {
        const rental = await insertContract();
        const assistance = await insertAssistanceContract();

        expect(await findIds({ type: "rental" })).toEqual([rental.id]);
        expect(await findIds({ type: "assistance" })).toEqual([assistance.id]);
    });

    it("filtra per cliente e per fornitore", async () => {
        const customer = await insertCustomer();
        const provider = await insertProvider();
        const mine = await insertContract({ customerId: customer.id, providerId: provider.id });
        await insertContract();

        expect(await findIds({ customerId: customer.id })).toEqual([mine.id]);
        expect(await findIds({ providerId: provider.id })).toEqual([mine.id]);
    });

    it("il totale conta le righe filtrate, non quelle della pagina", async () => {
        await insertContract({ status: "draft" });
        await insertContract({ status: "draft" });
        await insertContract({ status: "cancelled" });

        const result = await listContracts({ page: 1, pageSize: 1, timeZone, status: "draft" });

        expect(result).toMatchObject({ totalItems: 2 });
        expect(Array.isArray(result) ? [] : result.items).toHaveLength(1);
    });
});

describe("listContracts: ricerca libera", () => {
    it.each([
        ["il dispositivo", { device: "Zefirotron 9000" }, "zefirotron"],
        ["la nota", { device: "Altro", note: "Contratto zefiriano" }, "zefirian"],
    ])("trova per %s", async (_label, values, text) => {
        const target = await insertContract(values);
        await insertContract();

        expect(await findIds({ search: text })).toEqual([target.id]);
    });

    it("trova per nome del cliente, anche scritto per intero", async () => {
        const customer = await insertCustomer({ firstName: "Zefiro", lastName: "Bianchi" });
        const target = await insertContract({ customerId: customer.id });
        await insertContract();

        expect(await findIds({ search: "zefiro" })).toEqual([target.id]);
        expect(await findIds({ search: "bianchi" })).toEqual([target.id]);
        expect(await findIds({ search: "Zefiro Bianchi" })).toEqual([target.id]);
    });

    it("trova per nome del fornitore", async () => {
        const provider = await insertProvider({ providerName: "Zefirnet Srl" });
        const target = await insertContract({ providerId: provider.id });
        await insertContract();

        expect(await findIds({ search: "zefirnet" })).toEqual([target.id]);
    });

    it("un numero trova il contratto con quell'id, non quelli che lo contengono", async () => {
        const contracts = [];
        for (let index = 0; index < 12; index += 1) {
            contracts.push(await insertContract());
        }

        expect(await findIds({ search: "1" })).toEqual([contracts[0].id]);
    });

    it("una ricerca senza corrispondenze non trova niente e conta zero", async () => {
        await insertContract();

        const result = await listContracts({ page: 1, pageSize: 10, timeZone, search: "nessuna-corrispondenza" });

        expect(result).toEqual({ items: [], totalItems: 0 });
    });
});

describe("listContracts: ordinamento", () => {
    it("per data di inizio, nei due versi", async () => {
        const middle = await insertContract({ startDate: "2026-05-01" });
        const first = await insertContract({ startDate: "2026-01-01" });
        const last = await insertContract({ startDate: "2026-09-01" });

        expect(await findIds({ sortBy: "startDate", sortOrder: "asc" })).toEqual([first.id, middle.id, last.id]);
        expect(await findIds({ sortBy: "startDate", sortOrder: "desc" })).toEqual([last.id, middle.id, first.id]);
    });

    it("per data di fine, che dipende anche dal termine", async () => {
        // Inizio più tardi ma termine breve: finisce prima di quello iniziato a gennaio per un anno.
        const long = await insertContract({ startDate: "2026-01-01", term: "months_12" });
        const short = await insertContract({ startDate: "2026-06-01", term: "months_3" });

        expect(await findIds({ sortBy: "endDate", sortOrder: "asc" })).toEqual([short.id, long.id]);
    });

    it("per cliente, a parità di cliente per id", async () => {
        const anna = await insertCustomer({ firstName: "Anna", lastName: "Verdi" });
        const bruno = await insertCustomer({ firstName: "Bruno" });
        const second = await insertContract({ customerId: bruno.id });
        const first = await insertContract({ customerId: anna.id });
        const third = await insertContract({ customerId: bruno.id });

        expect(await findIds({ sortBy: "customer", sortOrder: "asc" })).toEqual([first.id, second.id, third.id]);
    });

    it("la paginazione non ripete né salta contratti con la stessa data di inizio", async () => {
        const contracts = [];
        for (let index = 0; index < 5; index += 1) {
            contracts.push(await insertContract({ startDate: "2026-01-01" }));
        }

        const seen: number[] = [];
        for (let page = 1; page <= 3; page += 1) {
            const result = await listContracts({ page, pageSize: 2, timeZone, sortBy: "startDate", sortOrder: "asc" });
            seen.push(...(Array.isArray(result) ? [] : result.items.map((item) => item.id)));
        }

        expect(seen).toEqual(contracts.map((contract) => contract.id));
    });
});

describe("listContracts: la riga", () => {
    it("porta nomi di cliente e fornitore e i dati di assistenza (NULL per il noleggio)", async () => {
        const customer = await insertCustomer({ firstName: "Mario", lastName: "Rossi" });
        const provider = await insertProvider({ providerName: "Acme Srl" });
        const assistance = await insertAssistanceContract(
            { customerId: customer.id, providerId: provider.id },
            { assistanceType: "on_site", includedHours: 20 }
        );
        const rental = await insertContract();

        const [assistanceRow] = await getContractById(assistance.id, timeZone);
        const [rentalRow] = await getContractById(rental.id, timeZone);

        expect(assistanceRow).toMatchObject({
            customerName: "Mario Rossi",
            providerName: "Acme Srl",
            assistanceType: "on_site",
            includedHours: 20,
        });
        expect(rentalRow).toMatchObject({ assistanceType: null, includedHours: null });
    });
});

describe("createContract / updateContractById", () => {
    it("crea contratto e riga di assistenza insieme", async () => {
        const customer = await insertCustomer();
        const provider = await insertProvider();

        const created = await createContract(
            {
                type: "assistance",
                term: "months_6",
                device: "NAS",
                startDate: "2026-10-01",
                customerId: customer.id,
                providerId: provider.id,
            },
            { assistanceType: "complete", includedHours: 100 }
        );
        const [row] = await getContractById(created.id, timeZone);

        expect(row).toMatchObject({ status: "draft", assistanceType: "complete", includedHours: 100 });
    });

    it("se la riga di assistenza è rifiutata il contratto non resta (rollback)", async () => {
        const customer = await insertCustomer();
        const provider = await insertProvider();

        await expect(
            createContract(
                {
                    type: "assistance",
                    term: "months_6",
                    device: "NAS",
                    startDate: "2026-10-01",
                    customerId: customer.id,
                    providerId: provider.id,
                },
                { assistanceType: "remote", includedHours: 100 }
            )
        ).rejects.toMatchObject({ cause: { constraint: "assistance_package_check" } });

        const { rows } = await pool.query("select count(*)::int as total from contract");
        expect(rows[0].total).toBe(0);
    });

    it("aggiorna anche solo l'assistenza, e valorizza updated_at del contratto", async () => {
        const contract = await insertAssistanceContract({}, { assistanceType: "remote", includedHours: 5 });

        await updateContractById(contract.id, {}, { includedHours: 20 });
        const [row] = await getContractById(contract.id, timeZone);

        expect(row.includedHours).toBe(20);
        expect(row.updated_at).not.toBeNull();
    });

    it("restituisce undefined per un contratto che non esiste", async () => {
        await expect(updateContractById(999, { device: "x" })).resolves.toBeUndefined();
    });

    it("elimina il contratto e la sua assistenza", async () => {
        const contract = await insertAssistanceContract();

        await expect(deleteContractById(contract.id)).resolves.toHaveLength(1);

        const { rows } = await pool.query("select count(*)::int as total from assistance");
        expect(rows[0].total).toBe(0);
    });
});

describe("hasLinkedInterventions", () => {
    it("dice se almeno un intervento è collegato al contratto", async () => {
        const customer = await insertCustomer();
        const contract = await insertAssistanceContract({ customerId: customer.id, status: "active" });
        const other = await insertAssistanceContract({ customerId: customer.id, status: "active" });

        expect(await hasLinkedInterventions(contract.id)).toBe(false);

        await insertIntervention({ customerId: customer.id, contractId: contract.id, type: "remote" });

        expect(await hasLinkedInterventions(contract.id)).toBe(true);
        // Quello di un altro contratto non conta.
        expect(await hasLinkedInterventions(other.id)).toBe(false);
    });
});
