import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `issueCatalog` parla con `db` direttamente (non con un query layer), come `authManager`:
 * stesso approccio, un builder concatenabile minimo che copre solo le chiamate usate qui
 * (`select().from().where().limit()` e `insert().values().onConflictDoNothing()`).
 */
let selectRows: unknown[] = [];
const insertCalls: { values?: Record<string, unknown> }[] = [];

const createSelectBuilder = () => {
    const builder = {
        from: () => builder,
        where: () => builder,
        limit: () => Promise.resolve(selectRows),
    };
    return builder;
};

const createInsertBuilder = () => {
    const call: { values?: Record<string, unknown> } = {};
    const builder = {
        values: (value: Record<string, unknown>) => {
            call.values = value;
            return builder;
        },
        onConflictDoNothing: () => {
            insertCalls.push(call);
            return Promise.resolve();
        },
    };
    return builder;
};

vi.mock("../db", () => ({
    db: {
        select: () => createSelectBuilder(),
        insert: () => createInsertBuilder(),
    },
}));

import { ensureCatchAllIssue, findCatchAllIssue, isCatchAllIssueDescription } from "./issueCatalog";

beforeEach(() => {
    vi.clearAllMocks();
    selectRows = [];
    insertCalls.length = 0;
});

describe("isCatchAllIssueDescription", () => {
    it("riconosce 'Altro' a prescindere da maiuscole e spazi", () => {
        expect(isCatchAllIssueDescription("Altro")).toBe(true);
        expect(isCatchAllIssueDescription("altro")).toBe(true);
        expect(isCatchAllIssueDescription("ALTRO")).toBe(true);
        expect(isCatchAllIssueDescription("  Altro  ")).toBe(true);
    });

    it("non riconosce un difetto normale, nemmeno se contiene 'altro'", () => {
        expect(isCatchAllIssueDescription("Un altro problema")).toBe(false);
        expect(isCatchAllIssueDescription("Batteria non carica")).toBe(false);
        expect(isCatchAllIssueDescription("")).toBe(false);
    });
});

describe("findCatchAllIssue", () => {
    it("restituisce la voce quando esiste nel catalogo", async () => {
        const riga = { id: 1, description: "Altro", created_at: new Date(), updated_at: null };
        selectRows = [riga];

        await expect(findCatchAllIssue()).resolves.toEqual(riga);
    });

    it("restituisce null quando il catalogo non ha la voce generica", async () => {
        selectRows = [];

        await expect(findCatchAllIssue()).resolves.toBeNull();
    });
});

describe("ensureCatchAllIssue", () => {
    it("non inserisce nulla se la voce generica esiste già", async () => {
        selectRows = [{ id: 1, description: "Altro", created_at: new Date(), updated_at: null }];

        await ensureCatchAllIssue();

        expect(insertCalls).toHaveLength(0);
    });

    /**
     * Usa onConflictDoNothing perché la descrizione è unica: se due avvii del server si
     * sovrappongono, il secondo insert non deve far fallire lo startup.
     */
    it("crea la voce se manca, tollerando un conflitto concorrente", async () => {
        selectRows = [];

        await ensureCatchAllIssue();

        expect(insertCalls).toHaveLength(1);
        expect(insertCalls[0].values).toEqual({ description: "Altro" });
    });
});
