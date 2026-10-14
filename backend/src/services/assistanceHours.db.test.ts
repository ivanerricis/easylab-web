import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import { assistanceHoursAlertTable, assistanceTable, interventionTable, providerTable } from "../db/schema";
import {
    insertAssistanceContract,
    insertCollaborator,
    insertCustomer,
    insertIntervention,
    insertProvider,
} from "../test/db/fixtures";
import type { NewIntervention } from "../db/types";

// Il database è vero; solo i due effetti verso l'esterno sono finti: l'invio dell'email e la
// notifica in app. Sono quelli che la regola "una sola volta" deve proteggere.
vi.mock("./emailManager", () => ({
    isEmailConfigured: vi.fn(),
    sendEmail: vi.fn(),
}));

vi.mock("./notificationManager", () => ({
    recordNotification: vi.fn(),
}));

vi.mock("../config/lab", () => ({
    getLabConfig: vi.fn(async () => ({
        labName: "EasyLab",
        labEmail: "info@easylab.it",
        labAddress: "Via Roma 1",
        labPhone: "02 1234567",
        timeZone: "Europe/Rome",
    })),
    getAppTimeZone: vi.fn(async () => "Europe/Rome"),
}));

import { isEmailConfigured, sendEmail } from "./emailManager";
import { recordNotification } from "./notificationManager";
import {
    checkAssistanceThresholds,
    consumingInterventionTypes,
    getMonthlyHours,
    getUsedHours,
    recheckAssistanceHours,
} from "./assistanceHours";

type Contract = Awaited<ReturnType<typeof insertAssistanceContract>>;

/** Un intervento collegato al contratto: completato e da remoto, di `hours` ore intere, salvo diversa richiesta. */
const addIntervention = async (contract: Contract, values: Partial<NewIntervention> & { hours?: number } = {}) => {
    const { hours = 1, ...rest } = values;
    const endHour = String(9 + hours).padStart(2, "0");

    return insertIntervention({
        customerId: contract.customerId,
        collaboratorId: (await insertCollaborator()).id,
        contractId: contract.id,
        type: "remote",
        status: "completed",
        interventionDate: "2026-10-10",
        startTime: "09:00",
        endTime: `${endHour}:00`,
        ...rest,
    });
};

/** Un contratto di assistenza con un fornitore dall'indirizzo noto. */
const createContract = async (
    assistance: Parameters<typeof insertAssistanceContract>[1] = {},
    values: Parameters<typeof insertAssistanceContract>[0] = {}
) => {
    const provider = await insertProvider();

    return insertAssistanceContract(
        { providerId: provider.id, customerId: (await insertCustomer()).id, ...values },
        assistance
    );
};

const alertRows = (contractId: number) =>
    db.select().from(assistanceHoursAlertTable).where(eq(assistanceHoursAlertTable.contractId, contractId));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isEmailConfigured).mockResolvedValue(true);
    vi.mocked(sendEmail).mockResolvedValue(undefined);
    vi.mocked(recordNotification).mockResolvedValue(undefined);
});

describe("consumingInterventionTypes", () => {
    it("ogni pacchetto consuma i suoi tipi e la consegna di materiale mai", () => {
        expect(consumingInterventionTypes("remote")).toEqual(["remote"]);
        expect(consumingInterventionTypes("on_site")).toEqual(["customer_site", "lab"]);
        expect(consumingInterventionTypes("complete")).toEqual(["remote", "customer_site", "lab"]);
        expect(consumingInterventionTypes("full_time")).toEqual(["remote", "customer_site", "lab"]);
    });
});

describe("getUsedHours", () => {
    it("somma le ore del mese di calendario, estremi compresi, e scarta i mesi vicini", async () => {
        const contract = await createContract();

        await addIntervention(contract, { interventionDate: "2026-09-30" });
        await addIntervention(contract, { interventionDate: "2026-10-01" });
        await addIntervention(contract, { interventionDate: "2026-10-31", hours: 2 });
        await addIntervention(contract, { interventionDate: "2026-11-01" });

        expect(await getUsedHours(contract.id, "2026-10")).toBe(3);
        expect(await getUsedHours(contract.id, "2026-09")).toBe(1);
        expect(await getUsedHours(contract.id, "2026-12")).toBe(0);
    });

    it("conta le ore decimali (un'ora e mezza)", async () => {
        const contract = await createContract();

        await addIntervention(contract, { startTime: "09:00", endTime: "10:30" });
        await addIntervention(contract, { startTime: "14:15", endTime: "14:45" });

        expect(await getUsedHours(contract.id, "2026-10")).toBe(2);
    });

    it("conta solo gli interventi completati", async () => {
        const contract = await createContract();

        await addIntervention(contract, { status: "scheduled" });
        await addIntervention(contract, { status: "in_progress" });
        await addIntervention(contract);

        expect(await getUsedHours(contract.id, "2026-10")).toBe(1);
    });

    it("conta solo gli interventi collegati a questo contratto", async () => {
        const contract = await createContract();
        const other = await createContract();

        await addIntervention(contract);
        await addIntervention(other, { hours: 5 });
        // Stesso cliente, stesso mese, ma non imputato a nessun contratto.
        await insertIntervention({
            customerId: contract.customerId,
            type: "remote",
            status: "completed",
            interventionDate: "2026-10-10",
            startTime: "09:00",
            endTime: "12:00",
        });

        expect(await getUsedHours(contract.id, "2026-10")).toBe(1);
    });

    it("il pacchetto da remoto consuma solo gli interventi da remoto", async () => {
        const contract = await createContract({ assistanceType: "remote", includedHours: 10 });

        await addIntervention(contract, { type: "remote" });
        await addIntervention(contract, { type: "customer_site", problem: "x" });
        await addIntervention(contract, { type: "lab", problem: "x" });

        expect(await getUsedHours(contract.id, "2026-10")).toBe(1);
    });

    it("il pacchetto in sede consuma intervento in sede e laboratorio, non il remoto", async () => {
        const contract = await createContract({ assistanceType: "on_site", includedHours: 10 });

        await addIntervention(contract, { type: "customer_site" });
        await addIntervention(contract, { type: "lab" });
        await addIntervention(contract, { type: "remote" });

        expect(await getUsedHours(contract.id, "2026-10")).toBe(2);
    });

    it("il pacchetto completo e il tempo pieno consumano remoto, in sede e laboratorio, mai la consegna", async () => {
        for (const assistance of [
            { assistanceType: "complete", includedHours: 100 },
            { assistanceType: "full_time", includedHours: null },
        ] as const) {
            const contract = await createContract(assistance);

            await addIntervention(contract, { type: "remote" });
            await addIntervention(contract, { type: "customer_site" });
            await addIntervention(contract, { type: "lab" });
            await addIntervention(contract, { type: "material_delivery" });

            expect(await getUsedHours(contract.id, "2026-10")).toBe(3);
        }
    });

    it("per un contratto di noleggio (o inesistente) è zero", async () => {
        expect(await getUsedHours(999, "2026-10")).toBe(0);
    });
});

describe("getMonthlyHours", () => {
    it("un elemento per ogni mese con ore, dal più recente, più il mese corrente anche a zero", async () => {
        const contract = await createContract();

        await addIntervention(contract, { interventionDate: "2026-08-05", hours: 2 });
        await addIntervention(contract, { interventionDate: "2026-09-30" });
        await addIntervention(contract, { interventionDate: "2026-09-02" });
        // Non conta: non completato.
        await addIntervention(contract, { interventionDate: "2026-07-01", status: "scheduled" });

        expect(await getMonthlyHours(contract.id, "2026-10")).toEqual([
            { month: "2026-10", usedHours: 0 },
            { month: "2026-09", usedHours: 2 },
            { month: "2026-08", usedHours: 2 },
        ]);
    });

    it("il mese corrente con ore non è duplicato", async () => {
        const contract = await createContract();

        await addIntervention(contract);

        expect(await getMonthlyHours(contract.id, "2026-10")).toEqual([{ month: "2026-10", usedHours: 1 }]);
    });

    it("senza nessun intervento c'è comunque il mese corrente", async () => {
        const contract = await createContract();

        expect(await getMonthlyHours(contract.id, "2026-10")).toEqual([{ month: "2026-10", usedHours: 0 }]);
    });
});

describe("checkAssistanceThresholds", () => {
    it("sotto l'80% non scrive e non avvisa nessuno", async () => {
        const contract = await createContract();

        await addIntervention(contract, { hours: 7 });
        await checkAssistanceThresholds(contract.id, "2026-10");

        expect(await alertRows(contract.id)).toHaveLength(0);
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("all'80% manda l'avviso al fornitore, con i dati del contratto", async () => {
        const contract = await createContract(
            { assistanceType: "remote", includedHours: 10 },
            { device: "Server NAS" }
        );

        await addIntervention(contract, { hours: 8 });
        await checkAssistanceThresholds(contract.id, "2026-10");

        expect(await alertRows(contract.id)).toMatchObject([{ kind: "warning", month: "2026-10-01" }]);
        expect(sendEmail).toHaveBeenCalledTimes(1);

        const mail = vi.mocked(sendEmail).mock.calls[0][0];

        const [provider] = await db.select().from(providerTable).where(eq(providerTable.id, contract.providerId));

        expect(mail.to).toBe(provider.email);
        expect(mail.subject).toMatch(/^Ore di assistenza quasi esaurite a ottobre 2026 - Cliente/);
        expect(mail.text).toContain("assistenza da remoto da 10 ore al mese");
        expect(mail.text).toContain("Server NAS");
        expect(mail.text).toContain("8 ore su 10");
        expect(mail.text).toContain("EasyLab");
        expect(recordNotification).not.toHaveBeenCalled();
    });

    it("al 100% manda l'avviso di esaurimento", async () => {
        const contract = await createContract();

        await addIntervention(contract, { hours: 10 });
        await checkAssistanceThresholds(contract.id, "2026-10");

        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toContain("esaurite a ottobre 2026");
        expect(vi.mocked(sendEmail).mock.calls[0][0].subject).not.toContain("quasi");
    });

    it("un salto oltre il 100% scrive entrambe le righe ma manda solo l'email di esaurimento", async () => {
        const contract = await createContract();

        await addIntervention(contract, { hours: 12 });
        await checkAssistanceThresholds(contract.id, "2026-10");

        const kinds = (await alertRows(contract.id)).map((row) => row.kind).sort();

        expect(kinds).toEqual(["exhausted", "warning"]);
        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(vi.mocked(sendEmail).mock.calls[0][0].subject).not.toContain("quasi");
    });

    it("prima l'80% e poi il 100%: due email, e una chiamata ripetuta non ne manda altre", async () => {
        const contract = await createContract();

        await addIntervention(contract, { hours: 8 });
        await checkAssistanceThresholds(contract.id, "2026-10");
        await checkAssistanceThresholds(contract.id, "2026-10");

        expect(sendEmail).toHaveBeenCalledTimes(1);

        await addIntervention(contract, { hours: 2, interventionDate: "2026-10-20" });
        await checkAssistanceThresholds(contract.id, "2026-10");
        await checkAssistanceThresholds(contract.id, "2026-10");

        expect(sendEmail).toHaveBeenCalledTimes(2);
        expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toContain("quasi esaurite");
        expect(vi.mocked(sendEmail).mock.calls[1][0].subject).not.toContain("quasi");
        expect((await alertRows(contract.id)).map((row) => row.kind).sort()).toEqual(["exhausted", "warning"]);
    });

    it("il mese dopo si riparte: gli avvisi di ottobre non coprono novembre", async () => {
        const contract = await createContract();

        await addIntervention(contract, { hours: 8, interventionDate: "2026-10-10" });
        await checkAssistanceThresholds(contract.id, "2026-10");
        await addIntervention(contract, { hours: 8, interventionDate: "2026-11-10" });
        await checkAssistanceThresholds(contract.id, "2026-11");

        expect(sendEmail).toHaveBeenCalledTimes(2);
        expect(vi.mocked(sendEmail).mock.calls[1][0].subject).toContain("novembre 2026");
        expect(await alertRows(contract.id)).toHaveLength(2);
    });

    it("con due controlli in parallelo oltre l'80% l'avviso parte una volta sola", async () => {
        const contract = await createContract();

        await addIntervention(contract, { hours: 8 });
        // Più chiamate insieme: si verificano quando due interventi si completano nello stesso istante.
        await Promise.all([
            checkAssistanceThresholds(contract.id, "2026-10"),
            checkAssistanceThresholds(contract.id, "2026-10"),
            checkAssistanceThresholds(contract.id, "2026-10"),
        ]);

        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(await alertRows(contract.id)).toHaveLength(1);
    });

    it("con due controlli in parallelo oltre il 100% parte una sola email di esaurimento", async () => {
        const contract = await createContract();

        await addIntervention(contract, { hours: 11 });
        await Promise.all([
            checkAssistanceThresholds(contract.id, "2026-10"),
            checkAssistanceThresholds(contract.id, "2026-10"),
        ]);

        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(vi.mocked(sendEmail).mock.calls[0][0].subject).not.toContain("quasi");
    });

    it("se le ore scendono sotto la soglia l'avviso si riarma e può scattare di nuovo", async () => {
        const contract = await createContract();
        const intervention = await addIntervention(contract, { hours: 8 });

        await checkAssistanceThresholds(contract.id, "2026-10");
        expect(await alertRows(contract.id)).toHaveLength(1);

        // L'intervento torna "in lavorazione": le ore non contano più.
        await db
            .update(interventionTable)
            .set({ status: "in_progress" })
            .where(eq(interventionTable.id, intervention.id));
        await checkAssistanceThresholds(contract.id, "2026-10");
        expect(await alertRows(contract.id)).toHaveLength(0);

        await db
            .update(interventionTable)
            .set({ status: "completed" })
            .where(eq(interventionTable.id, intervention.id));
        await checkAssistanceThresholds(contract.id, "2026-10");

        expect(await alertRows(contract.id)).toHaveLength(1);
        expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it("tornando sotto il 100% ma restando sopra l'80% si riarma solo l'esaurimento", async () => {
        const contract = await createContract();

        await addIntervention(contract, { hours: 8 });
        const second = await addIntervention(contract, { hours: 3, interventionDate: "2026-10-12" });
        await checkAssistanceThresholds(contract.id, "2026-10");

        await db.delete(interventionTable).where(eq(interventionTable.id, second.id));
        await checkAssistanceThresholds(contract.id, "2026-10");

        expect((await alertRows(contract.id)).map((row) => row.kind)).toEqual(["warning"]);

        await addIntervention(contract, { hours: 3, interventionDate: "2026-10-13" });
        await checkAssistanceThresholds(contract.id, "2026-10");

        // La prima volta una sola email (salto), la seconda di nuovo "esaurito"; "quasi" mai ripetuto.
        expect(sendEmail).toHaveBeenCalledTimes(2);
        expect(vi.mocked(sendEmail).mock.calls[1][0].subject).not.toContain("quasi");
    });

    it("aumentando il pacchetto l'avviso si riarma", async () => {
        const contract = await createContract({ assistanceType: "remote", includedHours: 10 });

        await addIntervention(contract, { hours: 8 });
        await checkAssistanceThresholds(contract.id, "2026-10");
        expect(sendEmail).toHaveBeenCalledTimes(1);

        await db.update(assistanceTable).set({ includedHours: 20 }).where(eq(assistanceTable.contractId, contract.id));
        await checkAssistanceThresholds(contract.id, "2026-10");
        expect(await alertRows(contract.id)).toHaveLength(0);

        // Tornando a un pacchetto più piccolo la soglia è di nuovo raggiunta, e l'avviso riparte.
        await db.update(assistanceTable).set({ includedHours: 10 }).where(eq(assistanceTable.contractId, contract.id));
        await checkAssistanceThresholds(contract.id, "2026-10");

        expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it("il tempo pieno non ha soglie: nessuna riga e nessuna email", async () => {
        const contract = await createContract({ assistanceType: "full_time", includedHours: null });

        await addIntervention(contract, { hours: 8 });
        await addIntervention(contract, { hours: 8, interventionDate: "2026-10-11" });
        await checkAssistanceThresholds(contract.id, "2026-10");

        expect(await alertRows(contract.id)).toHaveLength(0);
        expect(sendEmail).not.toHaveBeenCalled();
        expect(recordNotification).not.toHaveBeenCalled();
    });

    it("un contratto di noleggio o inesistente non fa nulla", async () => {
        await checkAssistanceThresholds(999, "2026-10");

        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("se l'invio dell'email fallisce l'avviso resta in app, con la chiave del contratto, mese e soglia", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(sendEmail).mockRejectedValue(new Error("SMTP spento"));
        const contract = await createContract();

        await addIntervention(contract, { hours: 8 });
        await checkAssistanceThresholds(contract.id, "2026-10");

        expect(recordNotification).toHaveBeenCalledTimes(1);
        expect(recordNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                dedupeKey: `contract-hours-${contract.id}-2026-10-warning`,
                severity: "warning",
                link: `/contracts/${contract.id}`,
                title: expect.stringContaining("80%"),
            })
        );
        // La riga dell'avviso c'è comunque: l'email non viene ritentata a ogni modifica.
        expect(await alertRows(contract.id)).toHaveLength(1);
    });

    it("senza email configurata l'avviso va in app e non si prova nemmeno a inviare", async () => {
        vi.mocked(isEmailConfigured).mockResolvedValue(false);
        const contract = await createContract();

        await addIntervention(contract, { hours: 10 });
        await checkAssistanceThresholds(contract.id, "2026-10");

        expect(sendEmail).not.toHaveBeenCalled();
        expect(recordNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                dedupeKey: `contract-hours-${contract.id}-2026-10-exhausted`,
                message: expect.stringContaining("non configurato"),
            })
        );
    });
});

describe("recheckAssistanceHours", () => {
    it("controlla una volta sola ogni coppia contratto-mese e ignora quelle senza contratto", async () => {
        const contract = await createContract();

        await addIntervention(contract, { hours: 8 });
        await recheckAssistanceHours([
            { contractId: contract.id, month: "2026-10" },
            { contractId: contract.id, month: "2026-10" },
            { contractId: null, month: "2026-10" },
            { contractId: contract.id, month: null },
        ]);

        expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it("non lascia uscire un errore di database: l'intervento è già scritto", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});

        // Un mese non valido fa fallire la query: la funzione deve comunque risolvere.
        await expect(recheckAssistanceHours([{ contractId: 1, month: "non-un-mese" }])).resolves.toBeUndefined();
    });

    it("riarma anche con l'intervento tolto (stesso passaggio che fa la rotta DELETE)", async () => {
        const contract = await createContract();
        const intervention = await addIntervention(contract, { hours: 9 });

        await recheckAssistanceHours([{ contractId: contract.id, month: "2026-10" }]);
        await db.delete(interventionTable).where(eq(interventionTable.id, intervention.id));
        await recheckAssistanceHours([{ contractId: contract.id, month: "2026-10" }]);

        expect(await alertRows(contract.id)).toHaveLength(0);
    });
});
