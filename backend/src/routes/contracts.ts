import { Router } from "express";
import { z } from "zod";
import {
    createContract,
    deleteContractById,
    getContractById,
    hasLinkedInterventions,
    listContracts,
    updateContractById,
    type ContractRow,
} from "../db/queries/contract";
import {
    assistancePackageHours,
    assistanceTypes,
    contractStatuses,
    contractStoredStatuses,
    contractTerms,
    contractTypes,
    type AssistanceType,
} from "../db/schema";
import { getAppTimeZone } from "../config/lab";
import { currentMonthKey } from "../db/queries/timeZone";
import { getContractHoursSummary, recheckAssistanceHours } from "../services/assistanceHours";
import { idParamsSchema, listQuerySchema, sendListResponse } from "./crudRouter";
import { validate } from "./validation";

const contractsRouter = Router();

const contractNotFoundMessage = "Contratto non trovato";
const invalidPackageMessage = "Pacchetto di ore non valido per questo tipo di assistenza";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// Il formato non basta: "2026-02-31" lo passa e Postgres lo rifiuta con un errore non
// gestito (500). Si riconverte la data e si controlla che sia la stessa.
const isRealDay = (value: string) => {
    const parsed = new Date(`${value}T00:00:00Z`);

    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};

const contractSortFields = ["startDate", "endDate", "createdAt", "customer"] as const;

const contractListQuerySchema = listQuerySchema.extend({
    sortBy: z.enum(contractSortFields).optional(),
    type: z.enum(["all", ...contractTypes]).optional(),
    // Lo stato effettivo: `expired` c'è solo qui, non nel corpo di una scrittura.
    status: z.enum(["all", ...contractStatuses]).optional(),
    customerId: z.coerce.number().int().positive().optional(),
    providerId: z.coerce.number().int().positive().optional(),
});

/**
 * Ore incluse valide per il tipo di assistenza: la tabella `assistancePackageHours` di
 * `schema.ts`, la stessa che il CHECK `assistance_package_check` fa rispettare al database.
 * Qui serve a rispondere con un 400 chiaro invece di aspettare l'errore del vincolo.
 */
const isValidPackage = (assistanceType: AssistanceType, includedHours: number | null) => {
    const allowed = assistancePackageHours[assistanceType];

    return allowed === null ? includedHours === null : includedHours !== null && allowed.includes(includedHours);
};

const assistanceBodySchema = z
    .object({
        assistanceType: z.enum(assistanceTypes),
        // NULL per il tempo pieno (ore illimitate), un numero di ore per gli altri.
        includedHours: z.number().int().positive().nullable().optional(),
    })
    .strict();

const contractBodyShape = {
    type: z.enum(contractTypes),
    status: z.enum(contractStoredStatuses).optional(),
    term: z.enum(contractTerms),
    device: z.string().trim().min(1).max(255),
    note: z.string().trim().max(4000).nullable().optional(),
    startDate: z.string().regex(dateRegex).refine(isRealDay, { message: "La data di inizio non è valida" }),
    customerId: z.coerce.number().int().positive(),
    providerId: z.coerce.number().int().positive(),
};

// Dati di assistenza obbligatori se e solo se il contratto è di assistenza: la disgiunzione
// delle due specializzazioni, vista dal corpo della richiesta.
const contractCreateBodySchema = z
    .object({ ...contractBodyShape, assistance: assistanceBodySchema.optional() })
    .strict()
    .superRefine((value, context) => {
        if (value.type === "assistance" && !value.assistance) {
            context.addIssue({
                code: "custom",
                path: ["assistance"],
                message: "I dati di assistenza sono obbligatori per un contratto di assistenza",
            });
        }

        if (value.type !== "assistance" && value.assistance) {
            context.addIssue({
                code: "custom",
                path: ["assistance"],
                message: "Solo un contratto di assistenza ha dati di assistenza",
            });
        }
    });

const contractUpdateBodySchema = z
    .object({
        ...contractBodyShape,
        assistance: assistanceBodySchema.partial().optional(),
    })
    .partial()
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
        message: "È necessario specificare almeno un campo",
    });

/**
 * Il JSON della API per un contratto. Parte dalla riga piatta delle query e la ripiega in
 * `assistance`; un punto solo da estendere quando si aggiungeranno i campi derivati (le ore).
 */
export const toContractDto = ({ assistanceType, includedHours, ...row }: ContractRow) => ({
    ...row,
    customerName: row.customerName ?? "",
    assistance: assistanceType ? { assistanceType, includedHours } : null,
});

contractsRouter.get("/", validate({ query: contractListQuerySchema }), async (req, res) => {
    const query = req.query as unknown as z.infer<typeof contractListQuerySchema>;

    const contracts = await listContracts({
        ...query,
        status: query.status ?? "all",
        type: query.type ?? "all",
        timeZone: await getAppTimeZone(),
    });

    sendListResponse(
        res,
        Array.isArray(contracts)
            ? contracts.map(toContractDto)
            : { ...contracts, items: contracts.items.map(toContractDto) },
        query.page,
        query.pageSize
    );
});

contractsRouter.get("/:id", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const timeZone = await getAppTimeZone();
    const [contract] = await getContractById(id, timeZone);

    if (!contract) {
        res.status(404).json({ message: contractNotFoundMessage });
        return;
    }

    // Le ore servono solo al dettaglio (la lista non le calcola: sarebbe una query per riga) e
    // solo per l'assistenza; il noleggio ha `hours: null` e nessuno storico.
    const hours = contract.assistanceType
        ? await getContractHoursSummary(id, contract.includedHours, currentMonthKey(timeZone))
        : { hours: null, monthlyHours: [] };

    res.json({ ...toContractDto(contract), ...hours });
});

contractsRouter.post("/", validate({ body: contractCreateBodySchema }), async (req, res) => {
    const { assistance, ...data } = req.body as z.infer<typeof contractCreateBodySchema>;
    const includedHours = assistance?.includedHours ?? null;

    if (assistance && !isValidPackage(assistance.assistanceType, includedHours)) {
        res.status(400).json({ message: invalidPackageMessage });
        return;
    }

    // Contratto e riga di assistenza nella stessa transazione: la totalità della
    // specializzazione non è espressa in SQL, la garantisce questa chiamata.
    const created = await createContract(
        data,
        assistance ? { assistanceType: assistance.assistanceType, includedHours } : undefined
    );
    const [contract] = await getContractById(created.id, await getAppTimeZone());

    res.status(201).json(toContractDto(contract));
});

contractsRouter.put("/:id", validate({ params: idParamsSchema, body: contractUpdateBodySchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const { assistance, ...data } = req.body as z.infer<typeof contractUpdateBodySchema>;
    const timeZone = await getAppTimeZone();
    const [current] = await getContractById(id, timeZone);

    if (!current) {
        res.status(404).json({ message: contractNotFoundMessage });
        return;
    }

    if (data.type !== undefined && data.type !== current.type) {
        res.status(400).json({ message: "Il tipo di contratto non si può cambiare" });
        return;
    }

    // I suoi interventi sono dello stesso cliente (chiave composta sull'intervento): cambiarlo li
    // lascerebbe di un altro. Il database rifiuta comunque, ma con un messaggio sull'eliminazione.
    if (data.customerId !== undefined && data.customerId !== current.customerId && (await hasLinkedInterventions(id))) {
        res.status(400).json({
            message: "Il cliente non si può cambiare: il contratto ha interventi collegati",
            field: "customerId",
        });
        return;
    }

    if (assistance && current.type !== "assistance") {
        res.status(400).json({ message: "Solo un contratto di assistenza ha dati di assistenza" });
        return;
    }

    // La riga risultante, come per gli interventi: il corpo è parziale, quindi il pacchetto
    // si valida sull'unione con i dati attuali. Cambiando solo il tipo in `full_time` le
    // ore diventano illimitate senza doverle azzerare a mano.
    let assistanceChanges: { assistanceType?: AssistanceType; includedHours?: number | null } | undefined;

    if (assistance && Object.keys(assistance).length > 0) {
        const assistanceType = assistance.assistanceType ?? (current.assistanceType as AssistanceType);
        const includedHours =
            assistance.includedHours !== undefined
                ? assistance.includedHours
                : assistance.assistanceType === "full_time"
                  ? null
                  : current.includedHours;

        if (!isValidPackage(assistanceType, includedHours)) {
            res.status(400).json({ message: invalidPackageMessage });
            return;
        }

        assistanceChanges = { assistanceType, includedHours };
    }

    // `type` è già uguale a quello attuale (controllo qui sopra): non si riscrive.
    const { type: _type, ...changes } = data;

    await updateContractById(id, changes, assistanceChanges);
    const [updated] = await getContractById(id, timeZone);

    // Il pacchetto può essere cambiato: più ore possono far rientrare il mese corrente sotto una
    // soglia (e riarmare l'avviso), meno ore possono farne scattare una.
    if (assistanceChanges) {
        await recheckAssistanceHours([{ contractId: id, month: currentMonthKey(timeZone) }]);
    }

    res.json(toContractDto(updated));
});

contractsRouter.delete("/:id", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const deleted = await deleteContractById(id);

    if (deleted.length === 0) {
        res.status(404).json({ message: contractNotFoundMessage });
        return;
    }

    res.json(deleted[0]);
});

export default contractsRouter;
