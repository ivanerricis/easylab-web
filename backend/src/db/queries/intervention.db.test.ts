import { describe, expect, it } from "vitest";
import { insertCollaborator, insertCustomer, insertIntervention } from "../../test/db/fixtures";
import { listInterventions } from "./intervention";

const timeZone = "Europe/Rome";

type ListParams = Omit<Parameters<typeof listInterventions>[0], "timeZone">;

const list = async (params: ListParams) => {
    const result = await listInterventions({ page: 1, pageSize: 100, timeZone, ...params });

    if (Array.isArray(result)) {
        throw new Error("attesa una lista paginata");
    }

    return result;
};

/** Gli id trovati, in ordine crescente: il confronto che interessa quasi sempre. */
const findIds = async (params: ListParams) => (await list(params)).items.map((item) => item.id).sort((a, b) => a - b);

/** Gli id nell'ordine restituito, per i test di ordinamento. */
const orderedIds = async (params: ListParams) => (await list(params)).items.map((item) => item.id);

const search = (text: string) => findIds({ search: text });

describe("listInterventions: ricerca libera", () => {
    it("trova per la descrizione dell'intervento", async () => {
        const target = await insertIntervention({ description: "Sostituito lo zefiro" });
        await insertIntervention({ description: "Altro lavoro" });

        expect(await search("zefiro")).toEqual([target.id]);
    });

    it.each([
        ["il nome", { firstName: "Zefirino" }, "zefir"],
        ["il cognome", { firstName: "Mario", lastName: "Zefirelli" }, "zefir"],
        ["il telefono", { firstName: "Mario", phoneNumber: "333 999 0001" }, "999 0001"],
        ["il secondo telefono", { firstName: "Mario", phoneNumberSecondary: "333 999 0001" }, "999 0001"],
    ])("trova per %s del cliente", async (_label, values, text) => {
        const customer = await insertCustomer(values);
        const target = await insertIntervention({ customerId: customer.id });
        await insertIntervention();

        expect(await search(text)).toEqual([target.id]);
    });

    it.each([
        ["il nome", { firstName: "Zefiro" }],
        ["il cognome", { firstName: "Luca", lastName: "Zefirotti" }],
    ])("trova per %s del collaboratore", async (_label, values) => {
        const collaborator = await insertCollaborator(values);
        const target = await insertIntervention({ collaboratorId: collaborator.id });
        await insertIntervention();

        expect(await search("zefiro")).toEqual([target.id]);
    });

    /** Campi che la ricerca libera non guarda: hanno i menù o nessun indice (vedi la query). */
    it("non cerca nel problema, nelle note, nel tipo e nello stato", async () => {
        await insertIntervention({
            problem: "zefiro",
            note: "zefiro",
            type: "consegna_materiale",
            status: "completato",
        });

        expect(await search("zefiro")).toEqual([]);
        expect(await search("consegna")).toEqual([]);
        expect(await search("completato")).toEqual([]);
    });

    it("non distingue maiuscole e minuscole", async () => {
        const target = await insertIntervention({ description: "Stampante BLOCCATA" });

        expect(await search("stampante bloccata")).toEqual([target.id]);
    });

    it("un numero trova l'intervento con quel numero, non quelli che lo contengono", async () => {
        const interventions = [];
        for (let index = 0; index < 12; index += 1) {
            interventions.push(await insertIntervention());
        }

        expect(await search("1")).toEqual([interventions[0].id]);
    });

    it("una ricerca senza corrispondenze non trova niente e conta zero", async () => {
        await insertIntervention({ description: "qualcosa" });

        expect(await list({ search: "nessuna-corrispondenza" })).toEqual({ items: [], totalItems: 0 });
    });

    it("il totale con la ricerca conta tutte le corrispondenze, non solo la pagina", async () => {
        const customer = await insertCustomer({ firstName: "Zefiro" });
        for (let index = 0; index < 5; index += 1) {
            await insertIntervention({ customerId: customer.id });
        }
        await insertIntervention();

        const result = await list({ search: "zefiro", page: 2, pageSize: 2 });

        expect(result.totalItems).toBe(5);
        expect(result.items).toHaveLength(2);
    });

    it("un intervento che corrisponde in più campi compare una volta sola", async () => {
        const customer = await insertCustomer({ firstName: "Zefiro" });
        const collaborator = await insertCollaborator({ firstName: "Zefiro" });
        const target = await insertIntervention({
            customerId: customer.id,
            collaboratorId: collaborator.id,
            description: "zefiro",
        });

        expect(await list({ search: "zefiro" })).toMatchObject({ items: [{ id: target.id }], totalItems: 1 });
    });

    it("si combina con gli altri filtri", async () => {
        const customer = await insertCustomer({ firstName: "Zefiro" });
        const done = await insertIntervention({ customerId: customer.id, status: "completato" });
        await insertIntervention({ customerId: customer.id, status: "programmato" });
        await insertIntervention({ status: "completato" });

        expect(await findIds({ search: "zefiro", status: "completato" })).toEqual([done.id]);
    });
});

describe("listInterventions: filtri", () => {
    it("filtra per stato e per tipo", async () => {
        const scheduledOnSite = await insertIntervention({ status: "programmato", type: "intervento_sede" });
        const doneRemote = await insertIntervention({ status: "completato", type: "intervento_remoto" });
        const doneDelivery = await insertIntervention({ status: "completato", type: "consegna_materiale" });

        expect(await findIds({ status: "programmato" })).toEqual([scheduledOnSite.id]);
        expect(await findIds({ status: "completato" })).toEqual([doneRemote.id, doneDelivery.id]);
        expect(await findIds({ type: "consegna_materiale" })).toEqual([doneDelivery.id]);
        expect(await findIds({ status: "completato", type: "intervento_remoto" })).toEqual([doneRemote.id]);
        expect(await findIds({ status: "all", type: "all" })).toHaveLength(3);
    });

    it("legge l'intervallo delle date di creazione nel fuso del laboratorio", async () => {
        // 23:30 UTC del 9 marzo = 00:30 del 10 marzo a Roma; 22:30 UTC = 23:30 del 9.
        const afterMidnight = await insertIntervention({ created_at: new Date("2026-03-09T23:30:00Z") });
        const beforeMidnight = await insertIntervention({ created_at: new Date("2026-03-09T22:30:00Z") });

        expect(await findIds({ dateFrom: "2026-03-10", dateTo: "2026-03-10" })).toEqual([afterMidnight.id]);
        expect(await findIds({ dateFrom: "2026-03-09", dateTo: "2026-03-09" })).toEqual([beforeMidnight.id]);
    });

    it("filtra per giorno dell'intervento", async () => {
        const target = await insertIntervention({ interventionDate: "2026-06-10" });
        await insertIntervention({ interventionDate: "2026-06-11" });
        await insertIntervention({ interventionDate: null });

        expect(await findIds({ scheduledDate: "2026-06-10" })).toEqual([target.id]);
    });

    /**
     * L'intervallo del calendario. Gli interventi senza data (quelli nati prima della colonna)
     * vi compaiono nel giorno di creazione, letto nel fuso del laboratorio.
     */
    it("filtra per intervallo del calendario, con gli interventi senza data sul giorno di creazione", async () => {
        const inside = await insertIntervention({ interventionDate: "2026-06-10" });
        const firstDay = await insertIntervention({ interventionDate: "2026-06-01" });
        const lastDay = await insertIntervention({ interventionDate: "2026-06-30" });
        await insertIntervention({ interventionDate: "2026-07-01" });
        // Senza data, creato alle 00:30 del 1° giugno a Roma (22:30 UTC del 31 maggio, ora legale).
        const undatedInside = await insertIntervention({
            interventionDate: null,
            created_at: new Date("2026-05-31T22:30:00Z"),
        });
        // Senza data, creato alle 23:30 del 31 maggio a Roma.
        await insertIntervention({ interventionDate: null, created_at: new Date("2026-05-31T21:30:00Z") });
        // Con data dentro l'intervallo ma creato fuori: conta la data dell'intervento.
        const datedCreatedOutside = await insertIntervention({
            interventionDate: "2026-06-15",
            created_at: new Date("2026-01-01T10:00:00Z"),
        });

        expect(await findIds({ scheduledFrom: "2026-06-01", scheduledTo: "2026-06-30" })).toEqual([
            inside.id,
            firstDay.id,
            lastDay.id,
            undatedInside.id,
            datedCreatedOutside.id,
        ]);
    });

    it("accetta l'intervallo del calendario aperto da un lato", async () => {
        const early = await insertIntervention({ interventionDate: "2026-06-01" });
        const late = await insertIntervention({ interventionDate: "2026-06-30" });

        expect(await findIds({ scheduledFrom: "2026-06-15" })).toEqual([late.id]);
        expect(await findIds({ scheduledTo: "2026-06-15" })).toEqual([early.id]);
    });

    it("filtra per cliente e per collaboratore", async () => {
        const customer = await insertCustomer();
        const collaborator = await insertCollaborator();
        const ofCustomer = await insertIntervention({ customerId: customer.id });
        const ofCollaborator = await insertIntervention({ collaboratorId: collaborator.id });
        await insertIntervention();

        expect(await findIds({ customerId: customer.id })).toEqual([ofCustomer.id]);
        expect(await findIds({ collaboratorId: collaborator.id })).toEqual([ofCollaborator.id]);
        expect((await list({ collaboratorId: collaborator.id })).totalItems).toBe(1);
    });
});

describe("listInterventions: ordinamento e paginazione", () => {
    it("ordina per data di creazione, dal più recente se non si chiede altro", async () => {
        const middle = await insertIntervention({ created_at: new Date("2026-02-01T10:00:00Z") });
        const oldest = await insertIntervention({ created_at: new Date("2026-01-01T10:00:00Z") });
        const newest = await insertIntervention({ created_at: new Date("2026-03-01T10:00:00Z") });

        expect(await orderedIds({})).toEqual([newest.id, middle.id, oldest.id]);
        expect(await orderedIds({ sortOrder: "asc" })).toEqual([oldest.id, middle.id, newest.id]);
    });

    it("ordina per data dell'intervento", async () => {
        const june = await insertIntervention({ interventionDate: "2026-06-01" });
        const may = await insertIntervention({ interventionDate: "2026-05-01" });
        const july = await insertIntervention({ interventionDate: "2026-07-01" });

        expect(await orderedIds({ sortBy: "interventionDate", sortOrder: "asc" })).toEqual([may.id, june.id, july.id]);
    });

    it("ordina per cliente e per stato", async () => {
        const bruno = await insertIntervention({
            customerId: (await insertCustomer({ firstName: "Bruno" })).id,
            status: "completato",
        });
        const anna = await insertIntervention({
            customerId: (await insertCustomer({ firstName: "Anna" })).id,
            status: "programmato",
        });
        const carla = await insertIntervention({
            customerId: (await insertCustomer({ firstName: "Carla" })).id,
            status: "in_lavorazione",
        });

        expect(await orderedIds({ sortBy: "customer", sortOrder: "asc" })).toEqual([anna.id, bruno.id, carla.id]);
        // Alfabetico sul valore salvato: completato, in_lavorazione, programmato.
        expect(await orderedIds({ sortBy: "status", sortOrder: "asc" })).toEqual([bruno.id, carla.id, anna.id]);
    });

    it("pagina i risultati e conta tutte le righe", async () => {
        const interventions = [];
        for (let day = 1; day <= 5; day += 1) {
            interventions.push(await insertIntervention({ created_at: new Date(`2026-04-0${day}T10:00:00Z`) }));
        }

        // Dal più recente: 5 4 | 3 2 | 1
        expect(await list({ page: 2, pageSize: 2 })).toMatchObject({
            totalItems: 5,
            items: [{ id: interventions[2].id }, { id: interventions[1].id }],
        });
        expect(await list({ page: 4, pageSize: 2 })).toEqual({ items: [], totalItems: 5 });
    });

    it("senza paginazione restituisce l'elenco intero", async () => {
        await insertIntervention();
        await insertIntervention();

        const result = await listInterventions({ timeZone });

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);
    });
});

describe("listInterventions: righe e join", () => {
    it("compone i campi mostrati dalle tabelle collegate", async () => {
        const customer = await insertCustomer({
            firstName: "Anna",
            lastName: "Rossi",
            phoneNumber: null,
            phoneNumberSecondary: "02 555",
        });
        const collaborator = await insertCollaborator({ firstName: "Luca", lastName: "Verdi" });
        const target = await insertIntervention({
            customerId: customer.id,
            collaboratorId: collaborator.id,
            type: "intervento_remoto",
            status: "completato",
            description: "Configurata la stampante",
            price: 40,
            paid: true,
            toInvoice: true,
            interventionDate: "2026-06-10",
            startTime: "09:00",
            endTime: "10:30",
        });

        expect(await list({})).toEqual({
            totalItems: 1,
            items: [
                {
                    id: target.id,
                    type: "intervento_remoto",
                    status: "completato",
                    problem: null,
                    description: "Configurata la stampante",
                    note: null,
                    price: 40,
                    paid: true,
                    toInvoice: true,
                    interventionDate: "2026-06-10",
                    startTime: "09:00:00",
                    endTime: "10:30:00",
                    customerId: customer.id,
                    collaboratorId: collaborator.id,
                    customer: "Anna Rossi",
                    customerPhone: "02 555",
                    collaborator: "Luca Verdi",
                    createdAt: target.created_at,
                    updatedAt: null,
                },
            ],
        });
    });

    it("senza paginazione legge anche problema e note, per l'esportazione CSV e la stampa riassuntiva", async () => {
        const target = await insertIntervention({
            problem: "Non si accende",
            note: "Cliente da richiamare",
        });

        const result = await listInterventions({ timeZone });

        if (!Array.isArray(result)) {
            throw new Error("attesa una lista non paginata");
        }

        expect(result[0]).toMatchObject({
            id: target.id,
            problem: "Non si accende",
            note: "Cliente da richiamare",
        });
    });
});
