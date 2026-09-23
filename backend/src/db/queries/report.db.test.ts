import { describe, expect, it } from "vitest";
import {
    assignTechnician,
    insertCollaborator,
    insertCustomer,
    insertDevice,
    insertIssue,
    insertReport,
    insertTechnician,
} from "../../test/db/fixtures";
import { getReportStats, listReports } from "./report";

const timeZone = "Europe/Rome";

/** Gli id trovati, in ordine: il confronto che interessa quasi sempre. */
const findIds = async (params: Omit<Parameters<typeof listReports>[0], "timeZone">) => {
    const result = await listReports({ page: 1, pageSize: 100, timeZone, ...params });

    if (Array.isArray(result)) {
        throw new Error("attesa una lista paginata");
    }

    return result.items.map((item) => item.id).sort((a, b) => a - b);
};

const search = (text: string) => findIds({ search: text });

describe("listReports: ricerca libera", () => {
    /**
     * Un campo alla volta, ognuno su un report diverso, con un solo altro report che non
     * c'entra: è l'elenco di quello che la ricerca deve continuare a trovare quando verrà
     * riscritta una tabella alla volta (voce del backlog prestazioni).
     */
    it.each([
        ["la nota", { note: "richiamare Zefiro" }],
        ["la password", { password: "pw-zefiro" }],
        ["la descrizione del problema", { issueDescription: "zefiro nel display" }],
        ["la descrizione dell'intervento", { serviceDescription: "pulito lo zefiro" }],
    ])("trova per %s del report", async (_label, values) => {
        const target = await insertReport(values);
        await insertReport();

        expect(await search("zefiro")).toEqual([target.id]);
    });

    it.each([
        ["il nome", { firstName: "Zefirino" }],
        ["il cognome", { firstName: "Mario", lastName: "Zefirelli" }],
        ["il telefono", { firstName: "Mario", phoneNumber: "333 999 0001" }],
        ["il secondo telefono", { firstName: "Mario", phoneNumberSecondary: "333 999 0001" }],
        ["l'email", { firstName: "Mario", email: "zefiro@example.com" }],
    ])("trova per %s del cliente", async (label, values) => {
        const customer = await insertCustomer(values);
        const target = await insertReport({ customerId: customer.id });
        await insertReport();

        const text = label.includes("telefono") ? "999 0001" : "zefir";
        expect(await search(text)).toEqual([target.id]);
    });

    it("trova per il nome del dispositivo e per il difetto", async () => {
        const device = await insertDevice("Zefiro Phone 3");
        const issue = await insertIssue("Batteria zefirata");
        const byDevice = await insertReport({ deviceId: device.id });
        const byIssue = await insertReport({ issueId: issue.id });
        await insertReport();

        expect(await search("zefiro phone")).toEqual([byDevice.id]);
        expect(await search("zefirata")).toEqual([byIssue.id]);
    });

    it.each([
        ["il nome", { firstName: "Zefiro" }],
        ["il cognome", { firstName: "Luca", lastName: "Zefirotti" }],
        ["il telefono", { firstName: "Luca", phoneNumber: "347 000 zefiro" }],
    ])("trova per %s del collaboratore", async (_label, values) => {
        const collaborator = await insertCollaborator(values);
        const target = await insertReport({ collaboratorId: collaborator.id });
        await insertReport();

        expect(await search("zefiro")).toEqual([target.id]);
    });

    it("trova un report senza collaboratore cercandone il cliente", async () => {
        // La join col collaboratore è una left join: un report senza non deve sparire.
        const customer = await insertCustomer({ firstName: "Zefiro" });
        const target = await insertReport({ customerId: customer.id, collaboratorId: null });

        expect(await search("zefiro")).toEqual([target.id]);
    });

    it("non distingue maiuscole e minuscole", async () => {
        const target = await insertReport({ note: "Schermo ROTTO" });

        expect(await search("schermo rotto")).toEqual([target.id]);
        expect(await search("SCHERMO rotto")).toEqual([target.id]);
    });

    it("ignora gli spazi attorno al testo", async () => {
        const target = await insertReport({ note: "zefiro" });

        expect(await search("  zefiro  ")).toEqual([target.id]);
    });

    /** Comportamento di oggi, non un desiderio: vedi la voce "unaccent" nel backlog. */
    it("non ignora gli accenti", async () => {
        const customer = await insertCustomer({ firstName: "Nicolò" });
        const target = await insertReport({ customerId: customer.id });

        expect(await search("Nicolò")).toEqual([target.id]);
        expect(await search("Nicolo")).toEqual([]);
    });

    it("un numero trova il report con quel numero, non quelli che lo contengono", async () => {
        const reports = [];
        for (let index = 0; index < 12; index += 1) {
            reports.push(await insertReport());
        }

        // Il report 1 esiste, e anche 10, 11 e 12 contengono "1": deve uscire solo il primo.
        expect(await search("1")).toEqual([reports[0].id]);
    });

    it("un numero trova anche i report che lo contengono in un campo di testo", async () => {
        const byId = await insertReport();
        const byPhone = await insertReport({
            customerId: (await insertCustomer({ phoneNumber: "0211111" })).id,
        });

        expect(byId.id).toBe(1);
        expect(await search("1")).toEqual([byId.id, byPhone.id]);
    });

    it("un numero oltre l'intero a 32 bit non dà errore", async () => {
        await insertReport();

        expect(await search("99999999999")).toEqual([]);
    });

    it("una ricerca senza corrispondenze non trova niente e conta zero", async () => {
        await insertReport({ note: "qualcosa" });

        const result = await listReports({ page: 1, pageSize: 10, search: "nessuna-corrispondenza", timeZone });

        expect(result).toEqual({ items: [], totalItems: 0 });
    });

    it("un report che corrisponde in più campi compare una volta sola", async () => {
        const customer = await insertCustomer({ firstName: "Zefiro", lastName: "Zefiri" });
        const collaborator = await insertCollaborator({ firstName: "Zefiro" });
        const target = await insertReport({
            customerId: customer.id,
            collaboratorId: collaborator.id,
            note: "zefiro",
            password: "zefiro",
        });

        const result = await listReports({ page: 1, pageSize: 10, search: "zefir", timeZone });

        expect(result).toMatchObject({ items: [{ id: target.id }], totalItems: 1 });
    });

    it("il totale con la ricerca conta tutte le corrispondenze, non solo la pagina", async () => {
        const customer = await insertCustomer({ firstName: "Zefiro" });
        for (let index = 0; index < 5; index += 1) {
            await insertReport({ customerId: customer.id });
        }
        await insertReport();

        const result = await listReports({ page: 2, pageSize: 2, search: "zefiro", timeZone });

        expect(result).toMatchObject({ totalItems: 5 });
        expect(Array.isArray(result) ? [] : result.items).toHaveLength(2);
    });

    it("si combina con gli altri filtri", async () => {
        // Chiuso richiede un collaboratore (CHECK del database, migration
        // 0035_report_domain_checks): la stessa riga serve a entrambi i report chiusi qui
        // sotto, che non hanno altro a che fare con lui.
        const collaborator = await insertCollaborator();
        const customer = await insertCustomer({ firstName: "Zefiro" });
        const open = await insertReport({ customerId: customer.id, closed: false });
        await insertReport({ customerId: customer.id, closed: true, collaboratorId: collaborator.id });
        await insertReport({ note: "zefiro", closed: true, collaboratorId: collaborator.id });

        expect(await findIds({ search: "zefiro", visibility: "open" })).toEqual([open.id]);
    });
});

describe("listReports: filtri", () => {
    it("filtra per visibilità", async () => {
        const collaborator = await insertCollaborator();
        const open = await insertReport({ closed: false });
        const closed = await insertReport({ closed: true, collaboratorId: collaborator.id });

        expect(await findIds({ visibility: "open" })).toEqual([open.id]);
        expect(await findIds({ visibility: "closed" })).toEqual([closed.id]);
        expect(await findIds({ visibility: "all" })).toEqual([open.id, closed.id]);
    });

    /**
     * Le date si salvano in UTC ma i filtri parlano di giorni del laboratorio: a Roma, in
     * marzo prima del cambio d'ora, è UTC+1.
     */
    it("legge l'intervallo di date nel fuso del laboratorio", async () => {
        // 23:30 UTC del 9 marzo = 00:30 del 10 marzo a Roma.
        const afterMidnight = await insertReport({ created_at: new Date("2026-03-09T23:30:00Z") });
        // 22:30 UTC del 9 marzo = 23:30 del 9 marzo a Roma.
        const beforeMidnight = await insertReport({ created_at: new Date("2026-03-09T22:30:00Z") });

        expect(await findIds({ dateFrom: "2026-03-10", dateTo: "2026-03-10" })).toEqual([afterMidnight.id]);
        expect(await findIds({ dateFrom: "2026-03-09", dateTo: "2026-03-09" })).toEqual([beforeMidnight.id]);
    });

    it("comprende entrambi gli estremi dell'intervallo, e ne accetta uno solo", async () => {
        const first = await insertReport({ created_at: new Date("2026-05-01T08:00:00Z") });
        const middle = await insertReport({ created_at: new Date("2026-05-15T08:00:00Z") });
        const last = await insertReport({ created_at: new Date("2026-05-31T21:59:00Z") }); // 23:59 a Roma
        const after = await insertReport({ created_at: new Date("2026-05-31T22:00:00Z") }); // mezzanotte

        expect(await findIds({ dateFrom: "2026-05-01", dateTo: "2026-05-31" })).toEqual([first.id, middle.id, last.id]);
        expect(await findIds({ dateFrom: "2026-05-15" })).toEqual([middle.id, last.id, after.id]);
        expect(await findIds({ dateTo: "2026-05-15" })).toEqual([first.id, middle.id]);
    });

    it("filtra per cliente e per collaboratore", async () => {
        const customer = await insertCustomer();
        const collaborator = await insertCollaborator();
        const ofCustomer = await insertReport({ customerId: customer.id });
        const ofCollaborator = await insertReport({ collaboratorId: collaborator.id });
        await insertReport();

        expect(await findIds({ customerId: customer.id })).toEqual([ofCustomer.id]);
        expect(await findIds({ collaboratorId: collaborator.id })).toEqual([ofCollaborator.id]);
    });

    it("filtra per tecnico esterno, anche nel totale", async () => {
        const technician = await insertTechnician();
        const otherTechnician = await insertTechnician();
        const assigned = await insertReport();
        const assignedToOther = await insertReport();
        await insertReport();
        await assignTechnician(assigned.id, technician.id, 30);
        await assignTechnician(assignedToOther.id, otherTechnician.id, 10);

        const result = await listReports({ page: 1, pageSize: 10, technicianId: technician.id, timeZone });

        expect(result).toMatchObject({ items: [{ id: assigned.id }], totalItems: 1 });
    });
});

describe("listReports: ordinamento e paginazione", () => {
    const insertAt = (iso: string, customerName: string) =>
        insertCustomer({ firstName: customerName }).then((customer) =>
            insertReport({ customerId: customer.id, created_at: new Date(iso) })
        );

    it("ordina per data di creazione, dal più recente se non si chiede altro", async () => {
        const middle = await insertAt("2026-02-01T10:00:00Z", "B");
        const oldest = await insertAt("2026-01-01T10:00:00Z", "C");
        const newest = await insertAt("2026-03-01T10:00:00Z", "A");

        const result = await listReports({ page: 1, pageSize: 10, timeZone });
        const ascending = await listReports({ page: 1, pageSize: 10, sortOrder: "asc", timeZone });

        expect(Array.isArray(result) ? [] : result.items.map((item) => item.id)).toEqual([
            newest.id,
            middle.id,
            oldest.id,
        ]);
        expect(Array.isArray(ascending) ? [] : ascending.items.map((item) => item.id)).toEqual([
            oldest.id,
            middle.id,
            newest.id,
        ]);
    });

    it("ordina per nome e cognome del cliente", async () => {
        const bianchi = await insertReport({
            customerId: (await insertCustomer({ firstName: "Anna", lastName: "Bianchi" })).id,
        });
        const rossi = await insertReport({
            customerId: (await insertCustomer({ firstName: "Anna", lastName: "Rossi" })).id,
        });
        const senzaCognome = await insertReport({ customerId: (await insertCustomer({ firstName: "Bruno" })).id });

        const result = await listReports({ page: 1, pageSize: 10, sortBy: "customer", sortOrder: "asc", timeZone });

        expect(Array.isArray(result) ? [] : result.items.map((item) => [item.id, item.customer])).toEqual([
            [bianchi.id, "Anna Bianchi"],
            [rossi.id, "Anna Rossi"],
            [senzaCognome.id, "Bruno"],
        ]);
    });

    it("pagina i risultati e conta tutte le righe", async () => {
        const reports = [];
        for (let day = 1; day <= 5; day += 1) {
            reports.push(await insertAt(`2026-04-0${day}T10:00:00Z`, `C${day}`));
        }

        const secondPage = await listReports({ page: 2, pageSize: 2, timeZone });
        const lastPage = await listReports({ page: 3, pageSize: 2, timeZone });
        const beyond = await listReports({ page: 4, pageSize: 2, timeZone });

        // Dal più recente: 5 4 | 3 2 | 1
        expect(secondPage).toMatchObject({ totalItems: 5, items: [{ id: reports[2].id }, { id: reports[1].id }] });
        expect(lastPage).toMatchObject({ totalItems: 5, items: [{ id: reports[0].id }] });
        expect(beyond).toEqual({ items: [], totalItems: 5 });
    });

    it("senza paginazione restituisce l'elenco intero", async () => {
        await insertReport();
        await insertReport();

        const result = await listReports({ timeZone });

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);
    });
});

describe("listReports: righe e join", () => {
    it("somma il compenso del tecnico esterno al prezzo interno", async () => {
        const technician = await insertTechnician();
        const withTechnician = await insertReport({ price: 50 });
        const withoutTechnician = await insertReport({ price: 20 });
        await assignTechnician(withTechnician.id, technician.id, 35);

        const result = await listReports({ page: 1, pageSize: 10, sortOrder: "asc", timeZone });

        expect(result).toMatchObject({
            totalItems: 2,
            items: [
                { id: withTechnician.id, price: 50, technicianPrice: 35, totalPrice: 85 },
                { id: withoutTechnician.id, price: 20, technicianPrice: 0, totalPrice: 20 },
            ],
        });
    });

    // D4: `technician` si chiamava così ma leggeva sempre il collaboratore, mai il tecnico
    // esterno vero. Ora `collaborator` è il collaboratore e `technicianName` (nullable) è il
    // tecnico esterno, dal join su `technicianTable` — vedi il contratto nel CHANGELOG.
    it("compone i campi mostrati dalle tabelle collegate, incluso il vero tecnico esterno", async () => {
        const customer = await insertCustomer({
            firstName: "Anna",
            lastName: "Rossi",
            phoneNumber: null,
            phoneNumberSecondary: "02 555",
        });
        const device = await insertDevice("iPhone 12");
        const issue = await insertIssue("Schermo rotto");
        const collaborator = await insertCollaborator({ firstName: "Luca", lastName: "Verdi" });
        const technician = await insertTechnician({ firstName: "Enzo", lastName: "Neri" });
        const withCollaborator = await insertReport({
            customerId: customer.id,
            deviceId: device.id,
            issueId: issue.id,
            collaboratorId: collaborator.id,
        });
        const withoutCollaborator = await insertReport({ customerId: customer.id, collaboratorId: null });
        await assignTechnician(withCollaborator.id, technician.id, 15);

        const result = await listReports({ page: 1, pageSize: 10, sortOrder: "asc", timeZone });

        expect(result).toMatchObject({
            items: [
                {
                    id: withCollaborator.id,
                    customer: "Anna Rossi",
                    customerPhone: "02 555",
                    device: "iPhone 12",
                    issue: "Schermo rotto",
                    collaborator: "Luca Verdi",
                    technicianName: "Enzo Neri",
                },
                { id: withoutCollaborator.id, collaborator: "-", technicianName: null },
            ],
        });
    });

    /**
     * D5: la stessa espressione SQL (`issueTextExpr`) che serve la ricevuta in
     * `getReportDetailById`, qui vista da `listReports` (il resoconto in `summaryPrint.ts`):
     * la descrizione scritta a mano se c'è, altrimenti l'etichetta del difetto dal catalogo.
     */
    it("issueText: la descrizione scritta a mano se c'è, altrimenti l'etichetta del difetto", async () => {
        const issue = await insertIssue("Altro");
        const withDescription = await insertReport({ issueId: issue.id, issueDescription: "Non si accende" });
        const withoutDescription = await insertReport({ issueId: issue.id, issueDescription: null });
        // Anche una descrizione fatta solo di spazi conta come vuota, come lato client.
        const blankDescription = await insertReport({ issueId: issue.id, issueDescription: "   " });

        const result = await listReports({ page: 1, pageSize: 10, sortOrder: "asc", timeZone });

        expect(result).toMatchObject({
            items: [
                { id: withDescription.id, issueText: "Non si accende" },
                { id: withoutDescription.id, issueText: "Altro" },
                { id: blankDescription.id, issueText: "Altro" },
            ],
        });
    });
});

/**
 * `getReportStats` raggruppa l'incasso per mese "del laboratorio", non per mese UTC: solo un
 * database vero, con l'aritmetica sulle date che gira per davvero, può accorgersi se un report
 * nato a cavallo della mezzanotte locale finisce nel bucket sbagliato. `now` è fissato per non
 * dipendere dal giorno in cui gira il test: gli ultimi sei mesi arrivano fino a febbraio 2026,
 * che è anche il mese richiesto di default (l'ultimo della serie).
 */
describe("getReportStats: confini del mese nel fuso del laboratorio", () => {
    const timeZone = "Europe/Rome";
    const now = new Date("2026-02-15T12:00:00Z");

    it("un report nato a un'ora dalla mezzanotte locale resta nel mese vecchio, uno nato dopo passa al nuovo", async () => {
        const collaborator = await insertCollaborator();
        // 23:00 a Roma (UTC+1, fuori dall'ora legale): ancora il 31 gennaio.
        await insertReport({
            closed: true,
            collaboratorId: collaborator.id,
            price: 100,
            created_at: new Date("2026-01-31T22:00:00Z"),
        });
        // 00:00 a Roma: già il 1° febbraio, un'ora dopo in UTC.
        await insertReport({
            closed: true,
            collaboratorId: collaborator.id,
            price: 200,
            created_at: new Date("2026-01-31T23:00:00Z"),
        });

        const stats = await getReportStats(undefined, timeZone, now);

        expect(stats.series.find((entry) => entry.monthKey === "2026-01")?.value).toBe(100);
        expect(stats.series.find((entry) => entry.monthKey === "2026-02")?.value).toBe(200);
        expect(stats.monthlyRevenue).toBe(200);
    });

    it("l'incasso del mese somma il prezzo interno e il compenso del tecnico esterno, il netto lo sottrae", async () => {
        const collaborator = await insertCollaborator();
        const technician = await insertTechnician();
        const withTechnician = await insertReport({
            closed: true,
            collaboratorId: collaborator.id,
            price: 100,
            created_at: new Date("2026-02-10T10:00:00Z"),
        });
        await assignTechnician(withTechnician.id, technician.id, 30);
        await insertReport({
            closed: true,
            collaboratorId: collaborator.id,
            price: 50,
            created_at: new Date("2026-02-11T10:00:00Z"),
        });

        const stats = await getReportStats("2026-02", timeZone, now);

        expect(stats.monthlyRevenue).toBe(180);
        expect(stats.monthlyNetRevenue).toBe(150);
    });

    it("un report ancora aperto non entra nell'incasso, ma conta fra quelli aperti", async () => {
        const collaborator = await insertCollaborator();
        await insertReport({ closed: false, price: 999, created_at: new Date("2026-02-10T10:00:00Z") });
        await insertReport({
            closed: true,
            collaboratorId: collaborator.id,
            price: 40,
            created_at: new Date("2026-02-10T10:00:00Z"),
        });

        const stats = await getReportStats("2026-02", timeZone, now);

        expect(stats.monthlyRevenue).toBe(40);
        expect(stats.openCount).toBe(1);
        expect(stats.closedCount).toBe(1);
    });
});
