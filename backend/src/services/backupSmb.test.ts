import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    pruneOldSmbBackups,
    smbPathPattern,
    testSmbConnection,
    uploadDumpToSmb,
    type SmbConnectionConfig,
} from "./backupSmb";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

/**
 * Come si comporta ogni smbclient avviato, nell'ordine: esce con un codice e un output,
 * non parte proprio (errore di spawn), oppure resta appeso finché non viene ucciso.
 */
type ScriptedRun =
    { stdout?: string; stderr?: string; code: number } | { spawnError: NodeJS.ErrnoException } | { hang: true };

type FakeChild = EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { end: () => void };
    kill: () => void;
};

const scriptRuns = (...runs: ScriptedRun[]) => {
    spawnMock.mockImplementation(() => {
        const run = runs.shift() ?? { code: 0 };
        const child = Object.assign(new EventEmitter(), {
            stdout: new EventEmitter(),
            stderr: new EventEmitter(),
            stdin: { end: vi.fn() },
            kill: vi.fn(() => {
                queueMicrotask(() => child.emit("close", null));
            }),
        }) as FakeChild;

        // Gli eventi partono dopo che `runSmbClient` ha agganciato i suoi listener.
        queueMicrotask(() => {
            if ("hang" in run) {
                return;
            }

            if ("spawnError" in run) {
                child.emit("error", run.spawnError);
                return;
            }

            if (run.stdout) child.stdout.emit("data", Buffer.from(run.stdout));
            if (run.stderr) child.stderr.emit("data", Buffer.from(run.stderr));
            child.emit("close", run.code);
        });

        return child;
    });
};

/** Il comando passato a `-c` in ciascuna chiamata, cioè ciò che smbclient esegue sul NAS. */
const commands = () => spawnMock.mock.calls.map((call) => (call[1] as string[]).at(-1));

const spawnError = (code: string, message = code) => Object.assign(new Error(message), { code });

const config = (path: string): SmbConnectionConfig => ({
    host: "nas.local",
    share: "backup",
    path,
    domain: "",
    port: 445,
    username: "easylab",
    password: "segreta",
});

describe("smbPathPattern", () => {
    it.each(["", "backup", "backup/easylab", "Backup EasyLab", "cartella\\sotto", "a-b_c.d", "2026/07"])(
        "accetta il percorso legittimo %j",
        (path) => {
            expect(smbPathPattern.test(path)).toBe(true);
        }
    );

    // `;` separa i comandi di smbclient: da li' passano `get` e `put`, cioe' scrittura e
    // lettura di file locali qualsiasi con i privilegi del backend. Gli altri caratteri non
    // servono a un percorso e non hanno motivo di passare.
    it.each([
        "backup; get payload /app/dist/index.js; echo ",
        "backup; put /app/data/secret.key rubata; echo ",
        'backup" ; ls "',
        "backup`id`",
        "backup$(id)",
        "backup|id",
        "backup&id",
        "backup\nls",
        "backup'x'",
    ])("rifiuta il percorso ostile %j", (path) => {
        expect(smbPathPattern.test(path)).toBe(false);
    });
});

describe("testSmbConnection", () => {
    it("rifiuta un percorso ostile prima ancora di avviare smbclient", async () => {
        spawnMock.mockClear();

        await expect(testSmbConnection(config("backup; get payload /app/dist/index.js; echo "))).rejects.toThrow(
            /cartella remota/i
        );
        expect(spawnMock).not.toHaveBeenCalled();
    });
});

describe("smbclient: come viene avviato", () => {
    beforeEach(() => {
        spawnMock.mockReset();
    });

    /** Gli argomenti di un processo si leggono con `ps` da chiunque sulla macchina: la password no. */
    it("passa la password nell'ambiente, mai fra gli argomenti", async () => {
        scriptRuns({ code: 0 });

        await testSmbConnection(config("backup"));

        const [command, args, options] = spawnMock.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }];
        expect(command).toBe("smbclient");
        expect(args.slice(0, 5)).toEqual(["//nas.local/backup", "-U", "easylab", "-p", "445"]);
        expect(args.join(" ")).not.toContain("segreta");
        expect(options.env.PASSWD).toBe("segreta");
    });

    it("aggiunge il dominio solo se è impostato", async () => {
        scriptRuns({ code: 0 }, { code: 0 });

        await testSmbConnection(config(""));
        await testSmbConnection({ ...config(""), domain: "UFFICIO" });

        expect(spawnMock.mock.calls[0][1]).not.toContain("-W");
        expect(spawnMock.mock.calls[1][1]).toEqual(expect.arrayContaining(["-W", "UFFICIO"]));
    });

    it("la prova di connessione entra nella cartella remota solo se è indicata", async () => {
        scriptRuns({ code: 0 }, { code: 0 });

        await testSmbConnection(config("backup/easylab"));
        await testSmbConnection(config("  "));

        expect(commands()).toEqual(['cd "backup/easylab"; ls', "ls"]);
    });

    it("un'uscita con errore diventa un 502 con la diagnostica che smbclient scrive su stdout", async () => {
        scriptRuns({ code: 1, stdout: "session setup failed: NT_STATUS_LOGON_FAILURE" });

        await expect(testSmbConnection(config(""))).rejects.toMatchObject({
            statusCode: 502,
            message: "session setup failed: NT_STATUS_LOGON_FAILURE",
        });
    });

    it("se smbclient non è installato lo dice con chiarezza", async () => {
        scriptRuns({ spawnError: spawnError("ENOENT") });

        await expect(testSmbConnection(config(""))).rejects.toMatchObject({
            statusCode: 500,
            message: expect.stringContaining("smbclient non trovato") as unknown,
        });
    });

    it("un altro errore di avvio riporta il messaggio del sistema", async () => {
        scriptRuns({ spawnError: spawnError("EACCES", "permesso negato") });

        await expect(testSmbConnection(config(""))).rejects.toMatchObject({
            statusCode: 500,
            message: "Errore avvio smbclient: permesso negato",
        });
    });

    describe("con un NAS che non risponde", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it("dopo il timeout uccide smbclient e risponde 504", async () => {
            scriptRuns({ hang: true });

            const pending = testSmbConnection(config(""));
            const outcome = expect(pending).rejects.toMatchObject({ statusCode: 504 });
            await vi.advanceTimersByTimeAsync(15_000);

            await outcome;
            const child = spawnMock.mock.results[0].value as FakeChild;
            expect(child.kill).toHaveBeenCalled();
        });
    });
});

describe("uploadDumpToSmb", () => {
    beforeEach(() => {
        spawnMock.mockReset();
    });

    it("crea la cartella remota e poi carica il file con il suo nome", async () => {
        scriptRuns({ code: 0 }, { code: 0 });

        await uploadDumpToSmb(config("backup/easylab"), "/app/backups/db-backup-20260914-020000.tar.gz");

        expect(commands()).toEqual([
            'mkdir "backup/easylab"',
            'cd "backup/easylab"; put "/app/backups/db-backup-20260914-020000.tar.gz" "db-backup-20260914-020000.tar.gz"',
        ]);
    });

    /** Dal secondo backup in poi il mkdir fallisce sempre così: è il caso normale. */
    it("prosegue se la cartella remota esiste già", async () => {
        scriptRuns({ code: 1, stdout: "NT_STATUS_OBJECT_NAME_COLLISION making remote directory" }, { code: 0 });

        await uploadDumpToSmb(config("backup"), "/app/backups/db-backup-20260914-020000.tar.gz");

        expect(commands()).toHaveLength(2);
    });

    it("si ferma se la cartella non si può creare per un altro motivo", async () => {
        scriptRuns({ code: 1, stdout: "NT_STATUS_ACCESS_DENIED" });

        await expect(
            uploadDumpToSmb(config("backup"), "/app/backups/db-backup-20260914-020000.tar.gz")
        ).rejects.toMatchObject({ statusCode: 502, message: "NT_STATUS_ACCESS_DENIED" });

        expect(commands()).toHaveLength(1);
    });

    it("senza cartella remota carica direttamente nella radice della condivisione", async () => {
        scriptRuns({ code: 0 });

        await uploadDumpToSmb(config(""), "/app/backups/db-backup-20260914-020000.tar.gz");

        expect(commands()).toEqual([
            'put "/app/backups/db-backup-20260914-020000.tar.gz" "db-backup-20260914-020000.tar.gz"',
        ]);
    });

    /** Il percorso arriva anche dalle impostazioni salvate, che un ripristino può sostituire. */
    it("rifiuta un percorso ostile senza avviare smbclient", async () => {
        await expect(
            uploadDumpToSmb(config("x; put /app/data/secret.key rubata"), "/app/backups/db-backup.tar.gz")
        ).rejects.toMatchObject({ statusCode: 400 });

        expect(spawnMock).not.toHaveBeenCalled();
    });
});

describe("pruneOldSmbBackups", () => {
    beforeEach(() => {
        spawnMock.mockReset();
    });

    const lsOutput = [
        "  .                                   D        0  Mon Sep 14 02:00:00 2026",
        "  ..                                  D        0  Mon Sep 14 02:00:00 2026",
        "  db-backup-20260912-020000.tar.gz    A  1048576  Sat Sep 12 02:00:00 2026",
        "  note.txt                            A      120  Sat Sep 12 02:00:00 2026",
        "  db-dump-20260901-020000.sql         A   524288  Tue Sep  1 02:00:00 2026",
        "  db-backup-20260914-020000.tar.gz    A  1048576  Mon Sep 14 02:00:00 2026",
    ].join("\n");

    it("cancella solo i backup più vecchi oltre la retention, e nient'altro nella cartella", async () => {
        scriptRuns({ code: 0, stdout: lsOutput }, { code: 0 });

        await pruneOldSmbBackups(config("backup"), 2);

        expect(commands()).toEqual(['cd "backup"; ls', 'cd "backup"; del "db-dump-20260901-020000.sql"']);
    });

    it("sotto la soglia si limita a elencare", async () => {
        scriptRuns({ code: 0, stdout: lsOutput });

        await pruneOldSmbBackups(config("backup"), 14);

        expect(commands()).toEqual(['cd "backup"; ls']);
    });
});
