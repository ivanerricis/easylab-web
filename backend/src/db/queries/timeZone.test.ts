import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { reportTable } from "../schema";
import { currentMonthKey, localDayStartUtc, onLocalDays, toLocalTimestamp } from "./timeZone";

/**
 * L'SQL che queste funzioni producono, com'è mandato a Postgres. Che Postgres lo calcoli come
 * atteso è verificato a mano sul database di sviluppo (CHANGELOG del 2026-09-15): qui si fissa la
 * forma, in particolare che la colonna resti nuda — è ciò che lascia usare l'indice.
 */
const render = (query: SQL) => new PgDialect().sqlToQuery(query);

describe("onLocalDays", () => {
    it("confronta la colonna nuda con gli estremi del giorno locale, il secondo escluso", () => {
        const { sql, params } = render(
            onLocalDays(reportTable.created_at, { from: "2026-09-01", to: "2026-09-14" }, "Europe/Rome")!
        );

        expect(sql).toBe(
            `("report"."created_at" >= ((($1::date)::timestamp AT TIME ZONE $2) AT TIME ZONE 'UTC') and ` +
                `"report"."created_at" < ((($3::date + 1)::timestamp AT TIME ZONE $4) AT TIME ZONE 'UTC'))`
        );
        expect(params).toEqual(["2026-09-01", "Europe/Rome", "2026-09-14", "Europe/Rome"]);
        // Il vecchio `created_at::date` calcolato su ogni riga, che escludeva l'indice.
        expect(sql).not.toContain('"created_at"::date');
    });

    it("con un solo estremo produce una sola condizione", () => {
        const { sql, params } = render(onLocalDays(reportTable.created_at, { to: "2026-09-14" }, "UTC")!);

        expect(sql).toBe(`"report"."created_at" < ((($1::date + 1)::timestamp AT TIME ZONE $2) AT TIME ZONE 'UTC')`);
        expect(params).toEqual(["2026-09-14", "UTC"]);
    });

    it("senza estremi non produce condizione", () => {
        expect(onLocalDays(reportTable.created_at, {}, "Europe/Rome")).toBeUndefined();
    });
});

describe("localDayStartUtc e toLocalTimestamp", () => {
    it("passano il fuso come parametro, mai dentro il testo della query", () => {
        const start = render(localDayStartUtc("2026-09-01", "Europe/Rome"));
        const local = render(toLocalTimestamp(reportTable.created_at, "Europe/Rome"));

        expect(start.sql).not.toContain("Europe/Rome");
        expect(local.sql).toBe(`((("report"."created_at") AT TIME ZONE 'UTC') AT TIME ZONE $1)`);
        expect(local.params).toEqual(["Europe/Rome"]);
    });
});

describe("currentMonthKey", () => {
    it("dà il mese del laboratorio, che a cavallo della mezzanotte può essere diverso da quello UTC", () => {
        // Le 00:30 del primo ottobre a Roma.
        const now = new Date("2026-09-30T22:30:00Z");

        expect(currentMonthKey("Europe/Rome", now)).toBe("2026-10");
        expect(currentMonthKey("UTC", now)).toBe("2026-09");
    });

    it("scrive il mese sempre a due cifre", () => {
        expect(currentMonthKey("UTC", new Date("2026-03-15T12:00:00Z"))).toBe("2026-03");
    });
});
