import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stat = vi.fn<(folder: string) => Promise<{ dev: number }>>();
const statfs = vi.fn<(folder: string) => Promise<{ blocks: number; bsize: number; bavail: number; bfree: number }>>();

vi.mock("node:fs", () => ({
    default: {
        promises: {
            stat: (folder: string) => stat(folder),
            statfs: (folder: string) => statfs(folder),
        },
    },
}));

const execute = vi.fn<() => Promise<{ rows: unknown[] }>>();

vi.mock("../db", () => ({
    db: { execute: () => execute() },
}));

const recordNotification = vi.fn();

vi.mock("./notificationManager", () => ({
    recordNotification: (input: unknown) => recordNotification(input),
}));

const sendAlertEmail = vi.fn<(input: { subject: string; text: string }) => Promise<void>>();

vi.mock("./alertEmail", () => ({
    sendAlertEmail: (input: { subject: string; text: string }) => sendAlertEmail(input),
}));

vi.mock("./companyManager", () => ({
    getCompanySettings: vi.fn().mockResolvedValue({ name: "Laboratorio Rossi" }),
}));

import {
    checkDiskSpace,
    getSystemStatus,
    resetDiskSpaceAlerts,
    startDiskSpaceMonitor,
    stopDiskSpaceMonitor,
} from "./systemStatus";

const GiB = 1024 ** 3;
const bsize = 4096;

// Un disco descritto in byte: blocchi e blocchi liberi se ne ricavano con la stessa dimensione di blocco.
// `reservedBytes` è la parte libera che ext4 tiene per root: conta in `bfree` ma non in `bavail`.
const disk = (totalBytes: number, freeBytes: number, reservedBytes = 0) => ({
    blocks: totalBytes / bsize,
    bsize,
    bavail: freeBytes / bsize,
    bfree: (freeBytes + reservedBytes) / bsize,
});

const isBackups = (folder: string) => folder.endsWith("backups");

// Per default: dati su un disco (dev 1) ampio e libero, backup su un altro (dev 2) uguale.
const givenDisks = (data: ReturnType<typeof disk>, backups: ReturnType<typeof disk> = disk(500 * GiB, 400 * GiB)) => {
    stat.mockImplementation(async (folder) => ({ dev: isBackups(folder) ? 2 : 1 }));
    statfs.mockImplementation(async (folder) => (isBackups(folder) ? backups : data));
};

beforeEach(() => {
    vi.clearAllMocks();
    resetDiskSpaceAlerts();
    givenDisks(disk(500 * GiB, 400 * GiB));
    execute.mockResolvedValue({ rows: [{ size: "123456789" }] });
    recordNotification.mockResolvedValue(undefined);
    sendAlertEmail.mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("getSystemStatus: dischi", () => {
    it("calcola totale e libero dai blocchi", async () => {
        const { disks } = await getSystemStatus();

        expect(disks[0]).toMatchObject({
            key: "data",
            totalBytes: 500 * GiB,
            usedBytes: 100 * GiB,
            freeBytes: 400 * GiB,
            low: false,
        });
    });

    // Il caso del CT di produzione (2026-10-16): Proxmox diceva 7,39 GiB usati su 19,52, la sezione
    // ne ricavava 8,4 dal libero per i non root. L'usato si conta come Proxmox, la soglia no.
    it("conta come libero, nell'usato, lo spazio riservato a root, ma non per la soglia", async () => {
        givenDisks(disk(20 * GiB, 1.5 * GiB, 1 * GiB));

        const [data] = (await getSystemStatus()).disks;

        expect(data).toMatchObject({ usedBytes: 17.5 * GiB, freeBytes: 1.5 * GiB, low: true });
    });

    it("segnala come basso un disco con meno del 10% libero", async () => {
        givenDisks(disk(1000 * GiB, 99 * GiB));

        expect((await getSystemStatus()).disks[0].low).toBe(true);
    });

    it("segnala come basso un disco con più del 10% libero ma meno di 2 GiB", async () => {
        givenDisks(disk(10 * GiB, 1.5 * GiB));

        expect((await getSystemStatus()).disks[0].low).toBe(true);
    });

    it("non segnala un disco sopra entrambe le soglie", async () => {
        givenDisks(disk(100 * GiB, 11 * GiB));

        expect((await getSystemStatus()).disks[0].low).toBe(false);
    });

    it("restituisce due voci quando dati e backup stanno su dischi diversi", async () => {
        const { disks } = await getSystemStatus();

        expect(disks.map((entry) => [entry.key, entry.label])).toEqual([
            ["data", "Disco del server"],
            ["backups", "Cartella dei backup"],
        ]);
    });

    it("unisce le voci quando dati e backup stanno sullo stesso disco", async () => {
        stat.mockResolvedValue({ dev: 7 });

        const { disks } = await getSystemStatus();

        expect(disks).toHaveLength(1);
        expect(disks[0]).toMatchObject({ key: "data", label: "Disco del server (dati e backup)" });
    });

    it("salta un percorso che dà errore e restituisce l'altro", async () => {
        statfs.mockImplementation(async (folder) => {
            if (isBackups(folder)) {
                throw new Error("ENOENT");
            }

            return disk(500 * GiB, 400 * GiB);
        });

        const { disks } = await getSystemStatus();

        expect(disks.map((entry) => entry.key)).toEqual(["data"]);
        expect(console.warn).toHaveBeenCalled();
    });

    it("salta un filesystem che dichiara zero blocchi", async () => {
        givenDisks(disk(500 * GiB, 400 * GiB), { blocks: 0, bsize: 4096, bavail: 0, bfree: 0 });

        const { disks } = await getSystemStatus();

        expect(disks.map((entry) => entry.key)).toEqual(["data"]);
    });
});

describe("getSystemStatus: database", () => {
    it("converte in numero la dimensione restituita come stringa", async () => {
        expect((await getSystemStatus()).databaseSizeBytes).toBe(123456789);
    });

    it("restituisce null se la query fallisce, senza far fallire il resto", async () => {
        execute.mockRejectedValue(new Error("connessione persa"));

        const status = await getSystemStatus();

        expect(status.databaseSizeBytes).toBeNull();
        expect(status.disks).toHaveLength(2);
        expect(console.error).toHaveBeenCalled();
    });

    it("indica quando è stato fatto il controllo", async () => {
        const before = Date.now();
        const checkedAt = Date.parse((await getSystemStatus()).checkedAt);

        expect(checkedAt).toBeGreaterThanOrEqual(before);
        expect(checkedAt).toBeLessThanOrEqual(Date.now());
    });
});

describe("checkDiskSpace", () => {
    const lowData = () => givenDisks(disk(100 * GiB, 5 * GiB));
    const okData = () => givenDisks(disk(100 * GiB, 50 * GiB));

    it("avvisa con notifica ed email quando un disco è basso", async () => {
        lowData();

        await checkDiskSpace();

        expect(recordNotification).toHaveBeenCalledTimes(1);
        expect(recordNotification).toHaveBeenCalledWith({
            dedupeKey: "low-disk-space:data",
            severity: "warning",
            title: "Spazio su disco in esaurimento",
            message: "Disco del server: usati 95,0 GB su 100 GB (95%).",
            link: "/settings?section=system",
        });
        expect(sendAlertEmail).toHaveBeenCalledTimes(1);
        expect(sendAlertEmail.mock.calls[0][0].subject).toBe("Spazio su disco in esaurimento - Laboratorio Rossi");
        expect(sendAlertEmail.mock.calls[0][0].text).toContain("Libera spazio o sposta i backup");
    });

    it("non avvisa se lo spazio è sufficiente", async () => {
        await checkDiskSpace();

        expect(recordNotification).not.toHaveBeenCalled();
        expect(sendAlertEmail).not.toHaveBeenCalled();
    });

    it("avvisa una volta sola su più controlli consecutivi bassi", async () => {
        lowData();

        await checkDiskSpace();
        await checkDiskSpace();
        await checkDiskSpace();

        expect(recordNotification).toHaveBeenCalledTimes(1);
        expect(sendAlertEmail).toHaveBeenCalledTimes(1);
    });

    it("riavvisa al calo successivo dopo che lo spazio è tornato sopra soglia", async () => {
        lowData();
        await checkDiskSpace();
        okData();
        await checkDiskSpace();
        lowData();
        await checkDiskSpace();

        expect(recordNotification).toHaveBeenCalledTimes(2);
        expect(sendAlertEmail).toHaveBeenCalledTimes(2);
    });

    it("non fa fallire il controllo se l'invio dell'email dà errore", async () => {
        lowData();
        sendAlertEmail.mockRejectedValue(new Error("SMTP giù"));

        await expect(checkDiskSpace()).resolves.toBeUndefined();
        await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
    });

    it("non lancia nemmeno se la notifica dà errore", async () => {
        lowData();
        recordNotification.mockRejectedValue(new Error("database giù"));

        await expect(checkDiskSpace()).resolves.toBeUndefined();
    });

    it("non legge il database", async () => {
        await checkDiskSpace();

        expect(execute).not.toHaveBeenCalled();
    });
});

describe("monitor", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        givenDisks(disk(100 * GiB, 5 * GiB));
    });

    afterEach(() => {
        stopDiskSpaceMonitor();
        vi.useRealTimers();
    });

    it("fa un primo controllo dopo circa un minuto", async () => {
        startDiskSpaceMonitor();

        await vi.advanceTimersByTimeAsync(59 * 1000);
        expect(recordNotification).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(2 * 1000);
        expect(recordNotification).toHaveBeenCalledTimes(1);
    });

    it("non avvisa di nuovo ai controlli orari successivi", async () => {
        startDiskSpaceMonitor();

        await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);

        expect(recordNotification).toHaveBeenCalledTimes(1);
    });

    it("non controlla più dopo lo stop", async () => {
        startDiskSpaceMonitor();
        stopDiskSpaceMonitor();

        await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);

        expect(recordNotification).not.toHaveBeenCalled();
    });
});
