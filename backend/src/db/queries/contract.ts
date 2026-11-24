import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
import { db } from "../index";
import {
    assistanceTable,
    contractDeviceTable,
    contractTable,
    customerDeviceTable,
    customerTable,
    interventionTable,
    providerTable,
    signedContractTable,
    type ContractStatus,
    type ContractType,
} from "../schema";
import type { NewAssistance, NewContract, UpdateContract } from "../types";
import { takeUnpaginated } from "./pagination";
import { personName } from "./personName";
import { linkContractDevices, unlinkContractDevices } from "./customerDevice";
import { containsText, parseIdSearch } from "./search";
import { currentLocalDay } from "./timeZone";

type ContractSortBy = "startDate" | "endDate" | "createdAt" | "customer";

type ListContractsParams = {
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: ContractSortBy;
    sortOrder?: "asc" | "desc";
    type?: "all" | ContractType;
    /** Lo stato effettivo: `expired` filtra i contratti attivi con la data di fine passata. */
    status?: "all" | ContractStatus;
    customerId?: number;
    providerId?: number;
    /** Il fuso in cui si legge "oggi" per decidere se un contratto attivo è scaduto. */
    timeZone: string;
};

/**
 * Le due colonne derivate del contratto, calcolate in un posto solo: la data di fine e lo
 * stato effettivo. Le usano la select di lista e di dettaglio, il filtro per stato e
 * l'ordinamento, così non possono divergere.
 *
 * - `endDate` = `start_date` + la durata del termine. L'aritmetica sui mesi è quella di
 *   Postgres (il 31 gennaio + 1 mese = 28 febbraio), e il cast riporta il `timestamp` a `date`.
 * - `effectiveStatus`: un contratto salvato `active` la cui data di fine è oggi o prima è
 *   `expired`. Mai scritto sul database, quindi niente cron che lo riscriva e niente stato
 *   salvato che invecchia. "Oggi" è il giorno del laboratorio, non quello del server.
 */
export const contractDerivedColumns = (timeZone: string) => {
    const endDate = sql<string>`(${contractTable.startDate} + ${contractTable.termMonths} * interval '1 month')::date`;
    const effectiveStatus = sql<ContractStatus>`CASE WHEN ${contractTable.status} = 'active' AND ${endDate} <= ${currentLocalDay(timeZone)}::date THEN 'expired' ELSE ${contractTable.status} END`;

    return { endDate, effectiveStatus };
};

/**
 * Gli id dei contratti che corrispondono alla ricerca libera: una query per tabella, unite,
 * come `matchingInterventionIds` in `intervention.ts` (lì il perché: un solo ramo non
 * indicizzato in un OR farebbe rinunciare Postgres agli indici trigram degli altri).
 * Il ramo dei dispositivi cerca nome, seriale e modello di quelli collegati.
 * Il ramo del cliente confronta anche il nome intero, così "Mario Rossi" trova Mario Rossi.
 */
const matchingContractIds = (search: string) => {
    const pattern = `%${search}%`;
    const idSearch = parseIdSearch(search);
    const contractIds = () => db.select({ id: contractTable.id }).from(contractTable);

    return union(
        contractIds().where(
            or(idSearch != null ? eq(contractTable.id, idSearch) : undefined, containsText(contractTable.note, pattern))
        ),
        contractIds()
            .innerJoin(contractDeviceTable, eq(contractDeviceTable.contractId, contractTable.id))
            .innerJoin(customerDeviceTable, eq(customerDeviceTable.id, contractDeviceTable.customerDeviceId))
            .where(
                or(
                    containsText(customerDeviceTable.name, pattern),
                    containsText(customerDeviceTable.serialNumber, pattern),
                    containsText(customerDeviceTable.model, pattern)
                )
            ),
        contractIds()
            .innerJoin(customerTable, eq(customerTable.id, contractTable.customerId))
            .where(
                or(
                    containsText(customerTable.firstName, pattern),
                    containsText(customerTable.lastName, pattern),
                    containsText(personName(customerTable.firstName, customerTable.lastName), pattern)
                )
            ),
        contractIds()
            .innerJoin(providerTable, eq(providerTable.id, contractTable.providerId))
            .where(containsText(providerTable.providerName, pattern))
    );
};

/**
 * La riga piatta del contratto con cliente, fornitore e dati di assistenza (NULL per il
 * noleggio). La rotta la trasforma nel JSON della API (`toContractDto`).
 */
const selectContracts = (timeZone: string) => {
    const { endDate, effectiveStatus } = contractDerivedColumns(timeZone);

    return db
        .select({
            id: contractTable.id,
            type: contractTable.type,
            status: contractTable.status,
            effectiveStatus,
            termMonths: contractTable.termMonths,
            billingMonths: contractTable.billingMonths,
            note: contractTable.note,
            startDate: contractTable.startDate,
            endDate,
            customerId: contractTable.customerId,
            customerName: personName(customerTable.firstName, customerTable.lastName),
            providerId: contractTable.providerId,
            providerName: providerTable.providerName,
            package: assistanceTable.package,
            includedHours: assistanceTable.includedHours,
            priceCents: assistanceTable.priceCents,
            // Solo i dati del contratto firmato, mai il file: la rotta li ripiega in `signedContract`.
            signedFileName: signedContractTable.fileName,
            signedSizeBytes: signedContractTable.sizeBytes,
            signedUploadedAt: signedContractTable.uploadedAt,
            created_at: contractTable.created_at,
            updated_at: contractTable.updated_at,
        })
        .from(contractTable)
        .innerJoin(customerTable, eq(customerTable.id, contractTable.customerId))
        .innerJoin(providerTable, eq(providerTable.id, contractTable.providerId))
        .leftJoin(assistanceTable, eq(assistanceTable.contractId, contractTable.id))
        .leftJoin(signedContractTable, eq(signedContractTable.contractId, contractTable.id));
};

export type ContractRow = Awaited<ReturnType<typeof getContractById>>[number];

export const listContracts = async ({
    page,
    pageSize,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
    type = "all",
    status = "all",
    customerId,
    providerId,
    timeZone,
}: ListContractsParams) => {
    const trimmedSearch = search?.trim();
    const { endDate, effectiveStatus } = contractDerivedColumns(timeZone);
    const whereConditions = [
        trimmedSearch ? inArray(contractTable.id, matchingContractIds(trimmedSearch)) : undefined,
        type !== "all" ? eq(contractTable.type, type) : undefined,
        status !== "all" ? sql`${effectiveStatus} = ${status}` : undefined,
        customerId ? eq(contractTable.customerId, customerId) : undefined,
        providerId ? eq(contractTable.providerId, providerId) : undefined,
    ].filter((condition): condition is SQL => condition != null);
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const sortColumn =
        sortBy === "customer"
            ? personName(customerTable.firstName, customerTable.lastName)
            : sortBy === "endDate"
              ? endDate
              : sortBy === "startDate"
                ? contractTable.startDate
                : contractTable.created_at;
    // L'id come ultimo criterio: date di inizio uguali sono la norma, e senza un ordine
    // totale la pagina successiva potrebbe ripetere o saltare un contratto.
    const orderBy = [sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn), asc(contractTable.id)];
    const baseQuery = selectContracts(timeZone)
        .where(whereClause)
        .orderBy(...orderBy);

    if (page == null || pageSize == null) {
        return takeUnpaginated(baseQuery, "contracts");
    }

    // Il totale legge solo `contract`: cliente e fornitore sono chiavi NOT NULL con chiave
    // esterna e l'assistenza è una left join su una riga al massimo, quindi le join non
    // cambiano il numero di righe (lo stesso vale per il contratto firmato). I filtri guardano solo `contract` (la ricerca per nome
    // passa da una sottoquery sugli id, e lo stato effettivo dalle sue colonne).
    const [items, totalCountRows] = await Promise.all([
        baseQuery.limit(pageSize).offset((page - 1) * pageSize),
        db
            .select({ total: sql<number>`count(*)` })
            .from(contractTable)
            .where(whereClause),
    ]);

    return {
        items,
        totalItems: Number(totalCountRows[0]?.total ?? 0),
    };
};

export const getContractById = (id: number, timeZone: string) =>
    selectContracts(timeZone).where(eq(contractTable.id, id));

/**
 * Crea il contratto e, per l'assistenza, la sua riga nella stessa transazione: è questo che
 * fa rispettare la totalità della specializzazione, che SQL da solo non esprime. Se la riga
 * di assistenza viene rifiutata (pacchetto non valido) il contratto non resta orfano.
 */
export const createContract = (
    data: NewContract,
    assistance?: Pick<NewAssistance, "package" | "includedHours" | "priceCents">,
    deviceIds: number[] = []
) =>
    db.transaction(async (tx) => {
        const [contract] = await tx.insert(contractTable).values(data).returning();

        if (assistance) {
            await tx.insert(assistanceTable).values({ ...assistance, contractId: contract.id });
        }

        await linkContractDevices(tx, contract.id, contract.customerId, deviceIds);

        return contract;
    });

/**
 * Aggiorna contratto e/o dati di assistenza in una transazione sola. Restituisce `undefined`
 * se il contratto non esiste. Se cambia solo l'assistenza, `updated_at` del contratto viene
 * comunque aggiornato a mano: drizzle non scrive niente su un `set({})`.
 */
export const updateContractById = (
    id: number,
    data: UpdateContract,
    assistance?: Partial<Pick<NewAssistance, "package" | "includedHours" | "priceCents">>,
    /** Se presente, l'elenco completo dei dispositivi (di `data.customerId` o del cliente attuale) che sostituisce quello di prima. */
    deviceIds?: number[]
) =>
    db.transaction(async (tx) => {
        // Prima si tolgono i collegamenti: con un altro cliente la chiave composta
        // (customer_id, contract_id) vieta di aggiornare un contratto che ne ha ancora, quindi
        // quelli vecchi vanno via tutti e i nuovi si aggiungono dopo l'aggiornamento.
        if (deviceIds) {
            await unlinkContractDevices(tx, id, data.customerId === undefined ? deviceIds : []);
        }

        const [contract] = await tx
            .update(contractTable)
            .set(Object.keys(data).length > 0 ? data : { updated_at: new Date() })
            .where(eq(contractTable.id, id))
            .returning();

        if (contract && assistance && Object.keys(assistance).length > 0) {
            await tx.update(assistanceTable).set(assistance).where(eq(assistanceTable.contractId, id));
        }

        if (contract && deviceIds) {
            await linkContractDevices(tx, id, contract.customerId, deviceIds);
        }

        return contract;
    });

/**
 * Se almeno un intervento è collegato al contratto. Serve prima di cambiare il cliente: la chiave
 * composta `(customer_id, contract_id)` dell'intervento lo impedirebbe comunque, ma l'errore di
 * Postgres per la modifica di una riga referenziata ("update or delete on table") è lo stesso
 * dell'eliminazione, e arrivava all'utente come "Impossibile eliminare il contratto" mentre il
 * contratto lo stava solo modificando.
 */
export const hasLinkedInterventions = async (contractId: number) => {
    const [row] = await db
        .select({ id: interventionTable.id })
        .from(interventionTable)
        .where(eq(interventionTable.contractId, contractId))
        .limit(1);

    return row !== undefined;
};

/** La riga di assistenza e il contratto sono cancellati insieme (cascata sulla chiave composta). */
export const deleteContractById = (id: number) => db.delete(contractTable).where(eq(contractTable.id, id)).returning();

/** I dati del contratto firmato (il PDF sta su disco: `services/signedContractFiles.ts`). */
export const getSignedContract = async (contractId: number) => {
    const [row] = await db.select().from(signedContractTable).where(eq(signedContractTable.contractId, contractId));

    return row;
};

/**
 * Salva il contratto firmato, sostituendo quello che c'era: ce n'è al più uno per contratto.
 * Se il contratto non esiste la chiave esterna lo rifiuta; la rotta lo controlla prima per
 * rispondere 404.
 */
export const saveSignedContract = async (contractId: number, fileName: string, sizeBytes: number) => {
    const values = { fileName, sizeBytes, uploadedAt: new Date() };
    const [row] = await db
        .insert(signedContractTable)
        .values({ contractId, ...values })
        .onConflictDoUpdate({ target: signedContractTable.contractId, set: values })
        .returning({
            fileName: signedContractTable.fileName,
            sizeBytes: signedContractTable.sizeBytes,
            uploadedAt: signedContractTable.uploadedAt,
        });

    return row;
};

export const deleteSignedContract = (contractId: number) =>
    db
        .delete(signedContractTable)
        .where(eq(signedContractTable.contractId, contractId))
        .returning({ contractId: signedContractTable.contractId });
