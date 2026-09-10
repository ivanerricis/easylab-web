import { afterEach, describe, expect, it } from "vitest";
import { BackupManagerError } from "./backupError";
import {
    assertNoOperationInProgress,
    beginDump,
    beginRestore,
    endDump,
    endRestore,
    isDumpInProgress,
} from "./backupLock";

// Stato di modulo condiviso fra i test: va sempre riportato a "libero", altrimenti un
// test che dimentica un end* fa fallire quelli dopo.
afterEach(() => {
    endDump();
    endRestore();
});

describe("assertNoOperationInProgress", () => {
    it("non blocca nulla quando non c'e' alcuna operazione in corso", () => {
        expect(() => assertNoOperationInProgress()).not.toThrow();
    });

    it("rifiuta un secondo dump mentre uno e' gia' in corso", () => {
        beginDump();

        try {
            assertNoOperationInProgress();
            expect.unreachable("doveva lanciare");
        } catch (error) {
            expect(error).toBeInstanceOf(BackupManagerError);
            expect((error as BackupManagerError).statusCode).toBe(409);
        }
    });

    it("rifiuta un ripristino mentre un dump e' in corso", () => {
        beginDump();

        expect(() => assertNoOperationInProgress()).toThrow(BackupManagerError);
    });

    it("rifiuta un dump mentre un ripristino e' in corso", () => {
        beginRestore();

        expect(() => assertNoOperationInProgress()).toThrow(BackupManagerError);
    });

    it("torna a non bloccare dopo che l'operazione e' terminata", () => {
        beginDump();
        endDump();

        expect(() => assertNoOperationInProgress()).not.toThrow();
    });
});

describe("isDumpInProgress", () => {
    it("riflette solo lo stato del dump, non quello del ripristino", () => {
        expect(isDumpInProgress()).toBe(false);

        beginRestore();
        expect(isDumpInProgress()).toBe(false);

        beginDump();
        expect(isDumpInProgress()).toBe(true);

        endDump();
        expect(isDumpInProgress()).toBe(false);
    });
});
