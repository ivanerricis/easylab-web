import express from "express";
import { ApiError } from "../services/apiError";
import { readRequestId } from "./requestLogger";

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
    // Nessuna voce per `report_technician_report_id_report_id_fk`: dalla migration 0032 è in
    // cascata, e il tecnico si scrive nella stessa transazione del suo report.
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
    contract_customer_id_customer_id_fk: {
        onDeleteParent: "Impossibile eliminare il cliente: è ancora associato a uno o più contratti.",
        onInvalidReference: "Il cliente selezionato non esiste.",
    },
    contract_provider_id_provider_id_fk: {
        onDeleteParent: "Impossibile eliminare il fornitore: è ancora associato a uno o più contratti.",
        onInvalidReference: "Il fornitore selezionato non esiste.",
    },
    // Chiave composta (customer_id, contract_id): oltre a un contratto inesistente, scatta
    // quando il contratto è di un altro cliente rispetto a quello dell'intervento.
    intervention_customer_contract_fk: {
        onDeleteParent: "Impossibile eliminare il contratto: è ancora collegato a uno o più interventi.",
        onInvalidReference: "Il contratto selezionato non esiste o non appartiene al cliente dell'intervento.",
    },
    // In cascata verso il contratto (la cancellazione non la raggiunge mai): resta il caso di
    // una riga di assistenza agganciata a un contratto di noleggio o inesistente.
    assistance_contract_fk: {
        onDeleteParent: "Impossibile eliminare il contratto: ha ancora dati di assistenza collegati.",
        onInvalidReference: "Il contratto selezionato non esiste o non è un contratto di assistenza.",
    },
    customer_device_customer_id_customer_id_fk: {
        onDeleteParent: "Impossibile eliminare il cliente: ha ancora dei dispositivi collegati.",
        onInvalidReference: "Il cliente selezionato non esiste.",
    },
    // Chiave composta (customer_id, customer_device_id): oltre a un dispositivo inesistente, scatta
    // quando il dispositivo è di un altro cliente rispetto a quello del contratto.
    contract_device_customer_device_fk: {
        onDeleteParent: "Impossibile eliminare il dispositivo: è ancora collegato a uno o più contratti.",
        onInvalidReference: "Il dispositivo selezionato non esiste o non appartiene al cliente del contratto.",
    },
    // In cascata verso il contratto (l'eliminazione non la raggiunge mai): resta il cambio del
    // cliente di un contratto con dispositivi, che la rotta rifiuta prima con un messaggio suo.
    contract_device_contract_fk: {
        onDeleteParent: "Il cliente del contratto non si può cambiare: ha dei dispositivi collegati.",
        onInvalidReference: "Il contratto selezionato non esiste.",
    },
    intervention_customer_device_id_customer_device_id_fk: {
        onDeleteParent: "Impossibile eliminare il dispositivo: è ancora indicato in uno o più interventi.",
        onInvalidReference: "Il dispositivo selezionato non esiste.",
    },
    // Chiave composta (contract_id, customer_device_id) verso i dispositivi del contratto.
    intervention_contract_device_fk: {
        onDeleteParent: "Impossibile togliere il dispositivo dal contratto: è ancora indicato in uno o più interventi.",
        onInvalidReference: "Il dispositivo selezionato non è fra quelli del contratto dell'intervento.",
    },
    assistance_hours_alert_contract_id_assistance_contract_id_fk: {
        onDeleteParent: "Impossibile eliminare il contratto: ha ancora avvisi di ore collegati.",
        onInvalidReference: "Il contratto di assistenza selezionato non esiste.",
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
    provider_provider_name_lower_idx: "Esiste già un fornitore con questo nome.",
    provider_email_unique: "Esiste già un fornitore con questa email.",
    provider_phone_number_unique: "Esiste già un fornitore con questo numero di telefono.",
    customer_device_customer_serial_lower_idx: "Questo cliente ha già un dispositivo con questo numero di serie.",
};

const GENERIC_UNIQUE_MESSAGE = "Esiste già un elemento con questi dati.";
const GENERIC_NOT_NULL_MESSAGE = "Campo obbligatorio mancante";

// Come `UNIQUE_MESSAGES`: due regole di dominio del report (vedi migration
// 0035_report_domain_checks) prima erano scritte due volte ciascuna, una volta nello schema/rotta
// di creazione e una volta a mano sulla PUT, con parole non sempre identiche. Ora le applica un
// solo CHECK di riga, a qualunque scrittura, e questa mappa traduce la violazione nello stesso
// messaggio italiano che le rotte davano prima.
const CHECK_MESSAGES: Record<string, string> = {
    report_paid_price_check: "Se il pagamento è in contanti o con carta, il prezzo deve essere maggiore di 0",
    report_closed_collaborator_check: "Per chiudere un report è necessario indicare un collaboratore",
    intervention_type_check: "Tipo di intervento non valido",
    intervention_status_check: "Stato dell'intervento non valido",
    contract_type_check: "Tipo di contratto non valido",
    contract_status_check: "Stato del contratto non valido",
    contract_term_check: "Durata del contratto non valida",
    assistance_contract_type_check: "Il contratto non è un contratto di assistenza",
    assistance_package_check: "Pacchetto di ore non valido per questo tipo di assistenza",
    assistance_hours_alert_kind_check: "Tipo di avviso ore non valido",
    customer_device_type_check: "Tipo di dispositivo non valido",
    intervention_device_contract_check: "Il dispositivo si può indicare solo per un intervento con contratto",
};

const GENERIC_CHECK_MESSAGE = "I dati inseriti non sono validi.";

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
    req: express.Request,
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

    if (code === "23514") {
        const clientMessage = (constraint && CHECK_MESSAGES[constraint]) || GENERIC_CHECK_MESSAGE;
        res.locals.apiErrorMessage = detail ?? clientMessage;
        res.status(400).json({ message: clientMessage });
        return;
    }

    // Il dettaglio Postgres (nomi di tabelle/colonne, frammenti di valori) resta
    // nei log lato server, mentre al client va un messaggio generico: su un errore
    // non gestito non sappiamo cosa contenga `detail`, quindi non è mostrabile.
    // La sigla e il percorso davanti allo stack: la riga del requestLogger dice utente e durata
    // della stessa richiesta, e senza questo legame lo stack resterebbe anonimo.
    console.error(`[req=${readRequestId(res)}] ${req.method} ${req.originalUrl.split("?")[0]}`, error);
    res.locals.apiErrorMessage = detail ?? message ?? GENERIC_ERROR_MESSAGE;
    res.status(500).json({ message: GENERIC_ERROR_MESSAGE });
};
