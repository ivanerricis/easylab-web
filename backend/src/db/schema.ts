import {
    integer,
    pgTable,
    varchar,
    boolean,
    timestamp,
    date,
    time,
    text,
    primaryKey,
    index,
    uniqueIndex,
    check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
    // Scritto da drizzle a ogni `update()` delle tabelle che usano questi campi. Prima lo
    // impostavano a mano tre query su otto (collaboratore, report, intervento): clienti,
    // tecnici, dispositivi e difetti lo lasciavano NULL per sempre. Il `default` NULL serve
    // all'inserimento: senza, drizzle chiamerebbe anche lì `$onUpdate`, e un report appena
    // creato mostrerebbe in scheda una "Ultima modifica" che non c'è stata.
    updated_at: timestamp()
        .default(sql`null`)
        .$onUpdate(() => new Date()),
    created_at: timestamp().defaultNow().notNull(),
};

const userFields = {
    firstName: varchar("first_name", { length: 255 }).notNull(),
    lastName: varchar("last_name", { length: 255 }),
    phoneNumber: varchar("phone_number", { length: 20 }),
};

/**
 * I metodi di pagamento del report: prima riscritti identici in `routes/reports.ts`,
 * `services/reportPdf.ts` e `routes/summaryPrint.ts`, ciascuno con il proprio cast `as` per
 * far tornare il tipo `string` di questa colonna a un'unione letterale. `$type` qui sotto
 * cambia solo il tipo TS della colonna (nessun vincolo SQL in più: resta un `varchar`), cosí
 * chi legge `reportTable.paymentMethod` da una query ottiene già l'unione, senza cast.
 */
export const reportPaymentMethods = ["non_paid", "cash", "card"] as const;
export type ReportPaymentMethod = (typeof reportPaymentMethods)[number];

export const reportTable = pgTable(
    "report",
    {
        id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
        note: varchar("note", { length: 255 }),
        password: varchar("password", { length: 255 }),
        issueDescription: varchar("issue_description", { length: 255 }),
        serviceDescription: varchar("service_description", { length: 255 }),
        dataBackup: boolean("data_backup").notNull().default(false),
        charger: boolean("charger").notNull().default(false),
        alerted: boolean("alerted").notNull().default(false),
        closed: boolean("closed").notNull().default(false),
        paymentMethod: varchar("payment_method", { length: 20 })
            .$type<ReportPaymentMethod>()
            .notNull()
            .default("non_paid"),
        price: integer("price").notNull().default(0),
        ...timestamps,
        deviceId: integer("device_id")
            .notNull()
            .references(() => deviceTable.id),
        issueId: integer("issue_id")
            .notNull()
            .references(() => IssueTable.id),
        collaboratorId: integer("collaborator_id").references(() => collaboratorTable.id),
        customerId: integer("customer_id")
            .notNull()
            .references(() => customerTable.id),
    },
    (table) => [
        index("report_device_id_idx").on(table.deviceId),
        index("report_issue_id_idx").on(table.issueId),
        index("report_collaborator_id_idx").on(table.collaboratorId),
        index("report_customer_id_idx").on(table.customerId),
        index("report_note_trgm_idx").using("gin", sql`${table.note} gin_trgm_ops`),
        index("report_password_trgm_idx").using("gin", sql`${table.password} gin_trgm_ops`),
        index("report_issue_description_trgm_idx").using("gin", sql`${table.issueDescription} gin_trgm_ops`),
        index("report_service_description_trgm_idx").using("gin", sql`${table.serviceDescription} gin_trgm_ops`),
        index("report_created_at_idx").on(table.created_at),
        // Le due regole di dominio del report, prima scritte due volte ciascuna (una volta nello
        // zod dello schema di creazione o in un `if` a mano, una volta in un altro `if` a mano
        // sulla PUT, con la riga unione di corpo parziale e riga esistente). Un vincolo di riga
        // qui le applica una volta sola, a qualunque scrittura, comprese quelle dirette che non
        // passano dalla rotta. `errorHandler.ts` traduce la violazione nel messaggio italiano.
        check("report_paid_price_check", sql`${table.paymentMethod} NOT IN ('cash', 'card') OR ${table.price} > 0`),
        check("report_closed_collaborator_check", sql`NOT ${table.closed} OR ${table.collaboratorId} IS NOT NULL`),
    ]
);

export const customerTable = pgTable(
    "customer",
    {
        id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
        ...userFields,
        // Ridefinito dopo lo spread: solo per il cliente il primo telefono è obbligatorio (va
        // contattato per forza), non per collaboratore e tecnico, che condividono `userFields`
        // con la versione facoltativa. Il secondo resta sempre facoltativo. Vedi CHANGELOG
        // 2026-09-23.
        phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
        phoneNumberSecondary: varchar("phone_number_secondary", { length: 20 }),
        email: varchar("email", { length: 255 }),
        city: varchar("city", { length: 255 }),
        ...timestamps,
    },
    (table) => [
        index("customer_first_name_trgm_idx").using("gin", sql`${table.firstName} gin_trgm_ops`),
        index("customer_last_name_trgm_idx").using("gin", sql`${table.lastName} gin_trgm_ops`),
        index("customer_phone_number_trgm_idx").using("gin", sql`${table.phoneNumber} gin_trgm_ops`),
        index("customer_phone_number_secondary_trgm_idx").using("gin", sql`${table.phoneNumberSecondary} gin_trgm_ops`),
        index("customer_email_trgm_idx").using("gin", sql`${table.email} gin_trgm_ops`),
        index("customer_city_trgm_idx").using("gin", sql`${table.city} gin_trgm_ops`),
        index("customer_created_at_idx").on(table.created_at),
        // Ricerca insensibile agli accenti (nome, cognome, città): vedi la migration
        // 0034_customer_search_unaccent per `immutable_unaccent`, il wrapper IMMUTABLE attorno a
        // `unaccent()` necessario perché quest'ultima è STABLE e non è ammessa in un'espressione
        // di indice.
        index("customer_first_name_unaccent_trgm_idx").using(
            "gin",
            sql`immutable_unaccent(${table.firstName}) gin_trgm_ops`
        ),
        index("customer_last_name_unaccent_trgm_idx").using(
            "gin",
            sql`immutable_unaccent(${table.lastName}) gin_trgm_ops`
        ),
        index("customer_city_unaccent_trgm_idx").using("gin", sql`immutable_unaccent(${table.city}) gin_trgm_ops`),
    ]
);

export const collaboratorTable = pgTable(
    "collaborator",
    {
        id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
        ...userFields,
        ...timestamps,
    },
    (table) => [
        index("collaborator_first_name_trgm_idx").using("gin", sql`${table.firstName} gin_trgm_ops`),
        index("collaborator_last_name_trgm_idx").using("gin", sql`${table.lastName} gin_trgm_ops`),
        index("collaborator_phone_number_trgm_idx").using("gin", sql`${table.phoneNumber} gin_trgm_ops`),
    ]
);

export const technicianTable = pgTable(
    "technician",
    {
        id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
        ...userFields,
        vatNumber: varchar("vat_number", { length: 20 }).unique(),
        ...timestamps,
    },
    (table) => [
        index("technician_first_name_trgm_idx").using("gin", sql`${table.firstName} gin_trgm_ops`),
        index("technician_last_name_trgm_idx").using("gin", sql`${table.lastName} gin_trgm_ops`),
        index("technician_phone_number_trgm_idx").using("gin", sql`${table.phoneNumber} gin_trgm_ops`),
        index("technician_vat_number_trgm_idx").using("gin", sql`${table.vatNumber} gin_trgm_ops`),
    ]
);

export const deviceTable = pgTable(
    "device",
    {
        id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
        name: varchar("name", { length: 255 }).notNull(),
        ...timestamps,
    },
    (table) => [
        // Senza maiuscole: altrimenti "iPhone 13" e "iphone 13" convivrebbero come due voci
        // distinte nel catalogo, cosa che il vincolo di Postgres di per sé non impedisce.
        uniqueIndex("device_name_lower_idx").on(sql`lower(${table.name})`),
        index("device_name_trgm_idx").using("gin", sql`${table.name} gin_trgm_ops`),
        index("device_created_at_idx").on(table.created_at),
    ]
);

export const IssueTable = pgTable(
    "issue",
    {
        id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
        description: varchar("description", { length: 255 }).notNull(),
        ...timestamps,
    },
    (table) => [
        // Stessa ragione del catalogo dispositivi: senza questo, "Altro" e "altro" potrebbero
        // convivere, e la protezione di `issueCatalog.ts` sulla voce generica presume che non accada.
        uniqueIndex("issue_description_lower_idx").on(sql`lower(${table.description})`),
        index("issue_description_trgm_idx").using("gin", sql`${table.description} gin_trgm_ops`),
    ]
);

export const reportTechnicianTable = pgTable(
    "report_technician",
    {
        // Cascata: il tecnico è un attributo del report, e se ne va con lui (migration 0032).
        reportId: integer("report_id")
            .notNull()
            .references(() => reportTable.id, { onDelete: "cascade" }),
        technicianId: integer("technician_id")
            .notNull()
            .references(() => technicianTable.id),
        price: integer("price").notNull().default(0),
        ...timestamps,
    },
    (table) => [
        primaryKey({ columns: [table.reportId] }),
        // La chiave primaria copre la ricerca per report, non quella per tecnico: la scheda del
        // tecnico filtra i report su questa colonna, e Postgres ci passa anche a ogni eliminazione
        // di un tecnico per controllare la chiave esterna. Senza, entrambe leggevano la tabella intera.
        index("report_technician_technician_id_idx").on(table.technicianId),
    ]
);

export const userTable = pgTable("user", {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    username: varchar("username", { length: 50 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    active: boolean("active").notNull().default(true),
    // Segreto TOTP cifrato con `secretCrypto` (payload `iv:tag:dati`), come la password
    // SMTP e quella del NAS: chi legge il database non ottiene un secondo fattore
    // funzionante.
    totpSecret: varchar("totp_secret", { length: 255 }),
    /** La 2FA è attiva solo se valorizzato: un segreto generato e mai confermato non conta. */
    totpConfirmedAt: timestamp("totp_confirmed_at"),
    /** Ultimo passo temporale accettato, perché ogni codice entri una volta sola. */
    totpLastStep: integer("totp_last_step"),
    /**
     * Etichette (`describeUserAgent`, es. "Chrome su Windows") dei dispositivi già visti per
     * questo utente, come array JSON. Serve solo a riconoscere un accesso da un dispositivo
     * mai usato prima e avvisare l'email del laboratorio (vedi `authManager.notifyNewDevice`);
     * non entra in nessuna decisione di sicurezza, come `session.user_agent` da cui nasce.
     * NULL equivale ad array vuoto: nessun dispositivo ancora noto.
     */
    knownDeviceLabels: text("known_device_labels"),
    ...timestamps,
});

export const sessionTable = pgTable(
    "session",
    {
        // sha256 del token consegnato nel cookie, mai il token stesso: una copia del
        // database (per esempio un archivio di backup) non deve permettere di riusare le
        // sessioni aperte. 64 caratteri esatti, quanti ne occupa l'hash in esadecimale.
        tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
        userId: integer("user_id")
            .notNull()
            .references(() => userTable.id, { onDelete: "cascade" }),
        expiresAt: timestamp("expires_at").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        /**
         * Ultima richiesta autenticata fatta con questo token. Senza, l'elenco delle sessioni
         * non distingueva quella in uso da quella aperta giorni fa su un browser mai più
         * riaperto: entrambe risultavano "attive" fino alla scadenza. Aggiornato al massimo
         * una volta ogni `sessionTouchIntervalMs` (vedi authManager), per non trasformare
         * ogni richiesta in una scrittura.
         */
        lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
        /**
         * L'header `User-Agent` del login, grezzo: `describeUserAgent` lo traduce in
         * "Chrome su Windows" a ogni lettura, così migliorare le regole migliora anche le
         * sessioni già aperte. Nullable perché le sessioni nate prima non l'hanno.
         */
        userAgent: varchar("user_agent", { length: 255 }),
    },
    (table) => [index("session_user_id_idx").on(table.userId)]
);

/**
 * Codici di recupero della 2FA: monouso, otto per utente, rigenerabili in blocco.
 *
 * Solo lo sha256, mai il codice: stesso ragionamento dei token di sessione qui sopra.
 * L'unico indice è quello unico su (utente, hash) — serve alla ricerca del codice
 * presentato al login, che parte sempre dall'utente già identificato dalla password, e
 * impedisce due codici uguali nello stesso blocco.
 */
export const userRecoveryCodeTable = pgTable(
    "user_recovery_code",
    {
        id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
        userId: integer("user_id")
            .notNull()
            .references(() => userTable.id, { onDelete: "cascade" }),
        codeHash: varchar("code_hash", { length: 64 }).notNull(),
        usedAt: timestamp("used_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => [uniqueIndex("user_recovery_code_user_id_code_hash_idx").on(table.userId, table.codeHash)]
);

export const notificationSeverities = ["info", "warning"] as const;

export const notificationTable = pgTable(
    "notification",
    {
        id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
        // Identifica l'evento, non la riga: un guasto che si ripete (es. il backup notturno
        // che fallisce ogni notte) aggiorna la riga esistente invece di accumularne una nuova.
        dedupeKey: varchar("dedupe_key", { length: 255 }).notNull().unique(),
        severity: varchar("severity", { length: 20 }).notNull().default("info"),
        title: varchar("title", { length: 255 }).notNull(),
        message: text("message"),
        /** Rotta dell'app aperta cliccando la notifica. */
        link: varchar("link", { length: 512 }),
        occurrences: integer("occurrences").notNull().default(1),
        lastOccurredAt: timestamp("last_occurred_at").defaultNow().notNull(),
        // Chiusura condivisa: chi legge la notifica la chiude per tutti.
        dismissedAt: timestamp("dismissed_at"),
        ...timestamps,
    },
    (table) => [index("notification_last_occurred_at_idx").on(table.lastOccurredAt)]
);

/**
 * Come `reportPaymentMethods` qui sopra: tipo e stato dell'intervento erano riscritti identici
 * in `routes/interventions.ts`, `services/interventionLabels.ts`, `db/queries/intervention.ts`
 * e `routes/summaryPrint.ts`, con un cast `as` a ogni punto in cui la colonna (tipizzata
 * `string` senza `$type`) doveva tornare a essere l'unione letterale.
 */
export const interventionTypes = ["consegna_materiale", "intervento_sede", "intervento_remoto"] as const;
export const interventionStatuses = ["programmato", "in_lavorazione", "completato"] as const;
export type InterventionType = (typeof interventionTypes)[number];
export type InterventionStatus = (typeof interventionStatuses)[number];

export const interventionTable = pgTable(
    "intervention",
    {
        id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
        type: varchar("type", { length: 30 }).$type<InterventionType>().notNull(),
        /**
         * L'assistenza effettuata, o i materiali consegnati. Resta NULL finché l'intervento
         * è solo programmato: è un'informazione che nasce quando il lavoro viene svolto.
         * Le rotte la richiedono negli altri due stati.
         */
        description: text("description"),
        /** Solo per gli interventi in sede o da remoto: resta NULL per le consegne materiale. */
        problem: text("problem"),
        /**
         * Annotazioni libere, sempre facoltative e valide per qualunque tipo e stato: è il
         * posto per quello che non rientra né nel problema né nel lavoro svolto (accordi presi
         * col cliente, materiale da riportare, promemoria per il prossimo passaggio).
         */
        note: text("note"),
        /** Facoltativo: alcuni interventi (es. consegne materiale) non hanno un prezzo da segnare. */
        price: integer("price"),
        /**
         * A differenza dei report, qui non conta il mezzo (contanti/carta): solo se
         * l'intervento è stato pagato o no.
         */
        paid: boolean("paid").notNull().default(false),
        /**
         * Indipendente da `paid`: dice se per questo intervento va emessa fattura, non se è
         * stato incassato. La gran parte del lavoro non si fattura, quindi il default è `false`.
         */
        toInvoice: boolean("to_invoice").notNull().default(false),
        status: varchar("status", { length: 20 }).$type<InterventionStatus>().notNull().default("programmato"),
        // Obbligatoria a ogni scrittura da `validateInterventionRow` (routes/interventions.ts),
        // per ogni tipo e stato, senza eccezioni: dichiararlo qui rende impossibile che una
        // scrittura che aggira quella funzione (uno script, una rotta futura) lasci una riga
        // senza data. Vedi CHANGELOG 2026-09-23.
        interventionDate: date("intervention_date").notNull(),
        startTime: time("start_time"),
        endTime: time("end_time"),
        ...timestamps,
        customerId: integer("customer_id")
            .notNull()
            .references(() => customerTable.id),
        collaboratorId: integer("collaborator_id")
            .notNull()
            .references(() => collaboratorTable.id),
    },
    (table) => [
        index("intervention_customer_id_idx").on(table.customerId),
        index("intervention_collaborator_id_idx").on(table.collaboratorId),
        // Il calendario carica solo l'intervallo di date che sta mostrando: senza questo
        // indice quel filtro sarebbe una scansione dell'intera tabella a ogni cambio di mese.
        index("intervention_intervention_date_idx").on(table.interventionDate),
        index("intervention_type_idx").on(table.type),
        index("intervention_status_idx").on(table.status),
        index("intervention_description_trgm_idx").using("gin", sql`${table.description} gin_trgm_ops`),
        index("intervention_created_at_idx").on(table.created_at),
    ]
);
