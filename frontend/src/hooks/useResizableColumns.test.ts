import { describe, expect, it } from "vitest";
import { resolveWidthsToPersist } from "./useResizableColumns";

describe("resolveWidthsToPersist", () => {
    const columnKeys = ["id", "customer", "device", "actions"];

    it("salva anche le colonne mai trascinate, alla loro larghezza naturale", () => {
        const persisted = resolveWidthsToPersist(
            columnKeys,
            { id: 60, customer: 200, device: 140, actions: 180 },
            { customer: 320 },
            "actions"
        );

        // Il punto della funzione: senza "id" e "device" la volta successiva verrebbero
        // rimisurati sulle righe di allora, e la tabella tornerebbe diversa da come è stata
        // lasciata.
        expect(persisted).toEqual({ id: 60, customer: 320, device: 140 });
    });

    it("lascia fuori la colonna elastica, che non ha una larghezza propria", () => {
        const persisted = resolveWidthsToPersist(columnKeys, { id: 60, actions: 180 }, {}, "actions");

        expect(persisted).not.toHaveProperty("actions");
    });

    it("non inventa voci per le colonne di cui non si conosce ancora la larghezza", () => {
        const persisted = resolveWidthsToPersist(columnKeys, null, { customer: 320 }, "actions");

        expect(persisted).toEqual({ customer: 320 });
    });
});
