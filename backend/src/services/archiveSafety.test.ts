import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findNonPlainEntry, findUnsafeTarEntry } from "./archiveSafety";

describe("findUnsafeTarEntry", () => {
    it("accetta file e cartelle", () => {
        const listing = [
            "-rw-r--r-- node/node  1234 2026-09-14 02:00:00 dump.sql",
            "drwxr-xr-x node/node     0 2026-09-14 02:00:00 data/",
            "-rw-r--r-- node/node    64 2026-09-14 02:00:00 data/logo/meta.json",
            "",
        ].join("\n");

        expect(findUnsafeTarEntry(listing)).toBeNull();
    });

    it("trova un collegamento simbolico", () => {
        const listing = [
            "drwxr-xr-x root/root 0 2026-09-15 07:25:17 data/logo/",
            "lrwxrwxrwx root/root 0 2026-09-15 07:25:17 data/logo/logo.png -> /app/data/secret.key",
        ].join("\n");

        expect(findUnsafeTarEntry(listing)).toContain("data/logo/logo.png");
    });

    // Il formato di busybox 1.37, il tar dell'immagine: il collegamento fisico sembra un file.
    it("trova un collegamento fisico scritto alla maniera di busybox", () => {
        expect(findUnsafeTarEntry("-rw-r--r-- root/root 0 2026-09-15 07:25:17 hard.sql -> dump.sql")).toContain(
            "hard.sql"
        );
    });

    it("trova un collegamento fisico scritto alla maniera di GNU tar", () => {
        expect(findUnsafeTarEntry("hrw-r--r-- root/root 0 2026-09-15 07:25 hard.sql link to dump.sql")).toContain(
            "hard.sql"
        );
    });

    it.each(["crw-r--r--", "brw-r--r--", "prw-r--r--"])("trova un dispositivo o una pipe (%s)", (mode) => {
        expect(findUnsafeTarEntry(`${mode} root/root 0 2026-09-15 07:25 dev`)).not.toBeNull();
    });
});

describe("findNonPlainEntry", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "archive-safety-"));
        fs.mkdirSync(path.join(workDir, "data", "logo"), { recursive: true });
        fs.writeFileSync(path.join(workDir, "dump.sql"), "SELECT 1;");
        fs.writeFileSync(path.join(workDir, "data", "logo", "meta.json"), "{}");
    });

    afterEach(() => {
        fs.rmSync(workDir, { recursive: true, force: true });
    });

    it("con soli file e cartelle non trova nulla", async () => {
        expect(await findNonPlainEntry(workDir)).toBeNull();
    });

    it("trova un file con un secondo nome (collegamento fisico)", async () => {
        fs.linkSync(path.join(workDir, "dump.sql"), path.join(workDir, "data", "logo", "logo.png"));

        expect(await findNonPlainEntry(workDir)).not.toBeNull();
    });

    it("trova un collegamento simbolico", async (context) => {
        try {
            fs.symlinkSync(path.join(workDir, "dump.sql"), path.join(workDir, "data", "logo", "logo.png"));
        } catch {
            // Windows senza modalità sviluppatore non crea collegamenti simbolici: il caso gira in CI.
            context.skip();
        }

        expect(await findNonPlainEntry(workDir)).toBe(path.join("data", "logo", "logo.png"));
    });
});
