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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
    updated_at: timestamp(),
    created_at: timestamp().defaultNow().notNull(),
};

const userFields = {
    firstName: varchar("first_name", { length: 255 }).notNull(),
    lastName: varchar("last_name", { length: 255 }),
    phoneNumber: varchar("phone_number", { length: 20 }),
};

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
        paymentMethod: varchar("payment_method", { length: 20 }).notNull().default("non_paid"),
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
    ]
);

export const customerTable = pgTable(
    "customer",
    {
        id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
        ...userFields,
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
        name: varchar("name", { length: 255 }).notNull().unique(),
        ...timestamps,
    },
    (table) => [
        index("device_name_trgm_idx").using("gin", sql`${table.name} gin_trgm_ops`),
        index("device_created_at_idx").on(table.created_at),
    ]
);

export const IssueTable = pgTable(
    "issue",
    {
        id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
        description: varchar("description", { length: 255 }).notNull().unique(),
        ...timestamps,
    },
    (table) => [index("issue_description_trgm_idx").using("gin", sql`${table.description} gin_trgm_ops`)]
);

export const reportTechnicianTable = pgTable(
    "report_technician",
    {
        reportId: integer("report_id")
            .notNull()
            .references(() => reportTable.id),
        technicianId: integer("technician_id")
            .notNull()
            .references(() => technicianTable.id),
        price: integer("price").notNull().default(0),
    },
    (table) => [primaryKey({ columns: [table.reportId] })]
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

export const interventionTypes = ["consegna_materiale", "intervento_sede", "intervento_remoto"] as const;
export const interventionStatuses = ["programmato", "in_lavorazione", "completato"] as const;

export const interventionTable = pgTable(
    "intervention",
    {
        id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
        type: varchar("type", { length: 30 }).notNull(),
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
        status: varchar("status", { length: 20 }).notNull().default("programmato"),
        interventionDate: date("intervention_date"),
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
