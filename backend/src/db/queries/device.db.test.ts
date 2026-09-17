import { describe, expect, it } from "vitest";
import { insertDevice } from "../../test/db/fixtures";
import { createDevice } from "./device";

describe("createDevice: unicità del nome", () => {
    it("rifiuta un nome duplicato solo per maiuscole/minuscole", async () => {
        await insertDevice("iPhone 13");

        await expect(createDevice({ name: "iphone 13" })).rejects.toMatchObject({ cause: { code: "23505" } });
    });

    it("accetta nomi distinti", async () => {
        await insertDevice("iPhone 13");

        await expect(createDevice({ name: "iPhone 14" })).resolves.toEqual([
            expect.objectContaining({ name: "iPhone 14" }),
        ]);
    });
});
