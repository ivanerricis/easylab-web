import express from "express";
import { ApiError } from "../services/apiError";

type PgError = {
    code?: string;
    detail?: string;
    message?: string;
    table?: string;
    constraint?: string;
};

const findPgError = (error: unknown): PgError => {
    const visited = new Set<object>();
    let current: unknown = error;

    while (current && typeof current === "object") {
        if (visited.has(current)) {
            break;
        }

        visited.add(current);

        const candidate = current as PgError & { cause?: unknown };

        if (candidate.code || candidate.detail) {
            return {
                code: candidate.code,
                detail: candidate.detail,
                message: candidate.message,
                table: candidate.table,
                constraint: candidate.constraint,
            };
        }

        current = (candidate as { cause?: unknown }).cause;
    }

    const fallback = error as { message?: string };
    return { message: fallback?.message };
};

// Foreign key constraint names follow drizzle-kit's default convention:
// <childTable>_<column>_<parentTable>_<parentColumn>_fk
// Kept as an explicit map (rather than parsed from the name) so wording stays
// natural in Italian and independent of Postgres' own error text/locale.
const FK_MESSAGES: Record<string, { onDeleteParent: string; onInvalidReference: string }> = {
    report_device_id_device_id_fk: {
        onDeleteParent: "Impossibile eliminare il dispositivo: è ancora associato a uno o più report.",
        onInvalidReference: "Il dispositivo selezionato non esiste.",
    },
    report_issue_id_issue_id_fk: {
        onDeleteParent: "Impossibile eliminare il guasto: è ancora associato a uno o più report.",
        onInvalidReference: "Il guasto selezionato non esiste.",
    },
    report_collaborator_id_collaborator_id_fk: {
        onDeleteParent: "Impossibile eliminare il collaboratore: è ancora associato a uno o più report.",
        onInvalidReference: "Il collaboratore selezionato non esiste.",
    },
    report_customer_id_customer_id_fk: {
        onDeleteParent: "Impossibile eliminare il cliente: è ancora associato a uno o più report.",
        onInvalidReference: "Il cliente selezionato non esiste.",
    },
    report_technician_report_id_report_id_fk: {
        onDeleteParent: "Impossibile eliminare il report: è ancora assegnato a uno o più tecnici.",
        onInvalidReference: "Il report selezionato non esiste.",
    },
    report_technician_technician_id_technician_id_fk: {
        onDeleteParent: "Impossibile eliminare il tecnico: è ancora assegnato a uno o più report.",
        onInvalidReference: "Il tecnico selezionato non esiste.",
    },
    intervention_customer_id_customer_id_fk: {
        onDeleteParent: "Impossibile eliminare il cliente: è ancora associato a uno o più interventi.",
        onInvalidReference: "Il cliente selezionato non esiste.",
    },
    intervention_collaborator_id_collaborator_id_fk: {
        onDeleteParent: "Impossibile eliminare il collaboratore: è ancora associato a uno o più interventi.",
        onInvalidReference: "Il collaboratore selezionato non esiste.",
    },
};

// Stessa idea per l'unicità. Prima al client arrivava il `detail` di Postgres ("Key
// (username)=(mario) already exists."): nomi di colonne e vincoli del database, in inglese,
// a chi usa l'app. Il dettaglio resta nel registro lato server, tramite `apiErrorMessage`.
const UNIQUE_MESSAGES: Record<string, string> = {
    user_username_unique: "Esiste già un utente con questo nome.",
    device_name_lower_idx: "Esiste già un dispositivo con questo nome.",
    issue_description_lower_idx: "Esiste già un guasto con questa descrizione.",
    technician_vat_number_unique: "Esiste già un tecnico con questa partita IVA.",
};

const GENERIC_UNIQUE_MESSAGE = "Esiste già un elemento con questi dati.";
const GENERIC_NOT_NULL_MESSAGE = "Campo obbligatorio mancante";

const foreignKeyViolationMessage = ({ constraint, message }: PgError): string => {
    const known = constraint ? FK_MESSAGES[constraint] : undefined;

    if (!known) {
        return "Riferimento non valido";
    }

    // The `table` field is unreliable here — Postgres always reports the
    // referencing (child) table there regardless of which side of the FK was
    // violated. The message prefix is the only signal that distinguishes a
    // blocked delete ("update or delete on table <parent>...") from an insert
    // referencing a non-existent row ("insert or update on table <child>...").
    const isDeleteBlockedByReference = message?.startsWith("update or delete");

    return isDeleteBlockedByReference ? known.onDeleteParent : known.onInvalidReference;
};

const GENERIC_ERROR_MESSAGE = "Si è verificato un errore imprevisto. Riprova più tardi.";

// Gli errori di multer hanno un campo `code` come quelli di Postgres, ma testuale: senza
// riconoscerli qui finirebbero nel ramo generico, e un file troppo grande risponderebbe
// "errore imprevisto" con status 500 invece di dire cosa è successo.
const MULTER_MESSAGES: Record<string, { message: string; status: number }> = {
    LIMIT_FILE_SIZE: { message: "Il file caricato supera la dimensione massima consentita", status: 413 },
    LIMIT_UNEXPECTED_FILE: { message: "Campo file non atteso nella richiesta", status: 400 },
};

export const errorHandler = (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
) => {
    // Errore sollevato di proposito da un servizio: il messaggio è già scritto per chi
    // usa l'app, e lo status dice cosa è successo. Va gestito prima delle euristiche su
    // Postgres, che qui non hanno niente da riconoscere.
    if (error instanceof ApiError) {
        res.locals.apiErrorMessage = error.message;
        res.status(error.statusCode).json({ message: error.message });
        return;
    }

    const multerError = error instanceof Error ? MULTER_MESSAGES[(error as { code?: string }).code ?? ""] : undefined;

    if (multerError) {
        res.locals.apiErrorMessage = multerError.message;
        res.status(multerError.status).json({ message: multerError.message });
        return;
    }

    const pgError = findPgError(error);
    const { code, detail, message, constraint } = pgError;

    // Nei tre casi riconosciuti il client riceve un messaggio scritto per lui; il `detail` di
    // Postgres, quando c'è, finisce solo nel registro delle azioni.
    if (code === "23505") {
        const clientMessage = (constraint && UNIQUE_MESSAGES[constraint]) || GENERIC_UNIQUE_MESSAGE;
        res.locals.apiErrorMessage = detail ?? clientMessage;
        res.status(409).json({ message: clientMessage });
        return;
    }

    if (code === "23503") {
        const clientMessage = foreignKeyViolationMessage(pgError);
        res.locals.apiErrorMessage = detail ?? clientMessage;
        res.status(400).json({ message: clientMessage });
        return;
    }

    if (code === "23502") {
        res.locals.apiErrorMessage = detail ?? GENERIC_NOT_NULL_MESSAGE;
        res.status(400).json({ message: GENERIC_NOT_NULL_MESSAGE });
        return;
    }

    // Il dettaglio Postgres (nomi di tabelle/colonne, frammenti di valori) resta
    // nei log lato server, mentre al client va un messaggio generico: su un errore
    // non gestito non sappiamo cosa contenga `detail`, quindi non è mostrabile.
    console.error(error);
    res.locals.apiErrorMessage = detail ?? message ?? GENERIC_ERROR_MESSAGE;
    res.status(500).json({ message: GENERIC_ERROR_MESSAGE });
};
