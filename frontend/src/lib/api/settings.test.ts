import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { dismissNotification, listNotifications } from "./notifications";
import {
    getBackupDumpDownloadUrl,
    getBackupKey,
    getLogDownloadUrl,
    listLogEntries,
    restoreBackupFromExisting,
    restoreBackupFromUpload,
    uploadLogo,
} from "./settings";
import { checkForUpdates, getUpdateState, getUpdateStatus, runUpdateNow } from "./system";

beforeEach(() => {
    vi.restoreAllMocks();
});

describe("api impostazioni", () => {
    it("codifica il nome del file di backup nell'URL di download", () => {
        expect(getBackupDumpDownloadUrl("db backup#1.tar.gz")).toContain(
            "/settings/backup/download/db%20backup%231.tar.gz"
        );
    });

    it("ripristina da un backup esistente indicando se azzerare lo schema", async () => {
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: { message: "ok" } });

        await restoreBackupFromExisting("db-backup-1.tar.gz", true);

        expect(post).toHaveBeenCalledWith("/settings/backup/restore", {
            fileName: "db-backup-1.tar.gz",
            resetSchema: true,
        });
    });

    /** Serve solo quando l'archivio è cifrato con la chiave di un altro server. */
    it("include la chiave di backup nel ripristino solo quando è indicata", async () => {
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: { message: "ok" } });

        await restoreBackupFromExisting("db-backup-1.tar.gz", true, "ab".repeat(32));

        expect(post).toHaveBeenCalledWith("/settings/backup/restore", {
            fileName: "db-backup-1.tar.gz",
            resetSchema: true,
            backupKey: "ab".repeat(32),
        });
    });

    /** Il backend legge il file dal campo "dump" e il flag come stringa multipart. */
    it("carica il backup da ripristinare come multipart", async () => {
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: { message: "ok" } });
        const file = new File(["dump"], "backup.tar.gz");

        await restoreBackupFromUpload(file, false);

        const [url, body] = post.mock.calls[0] as [string, FormData];
        expect(url).toBe("/settings/backup/restore/upload");
        expect(body.get("dump")).toBeInstanceOf(File);
        expect((body.get("dump") as File).name).toBe("backup.tar.gz");
        expect(body.get("resetSchema")).toBe("false");
        expect(body.get("backupKey")).toBeNull();
    });

    it("include la chiave di backup nel multipart quando è indicata", async () => {
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: { message: "ok" } });
        const file = new File(["dump"], "backup.tar.gz");

        await restoreBackupFromUpload(file, false, "cd".repeat(32));

        const [, body] = post.mock.calls[0] as [string, FormData];
        expect(body.get("backupKey")).toBe("cd".repeat(32));
    });

    it("esporta la chiave di backup", async () => {
        const get = vi.spyOn(api, "get").mockResolvedValue({ data: { key: "ab".repeat(32) } });

        await expect(getBackupKey()).resolves.toEqual({ key: "ab".repeat(32) });
        expect(get).toHaveBeenCalledWith("/settings/backup/key");
    });

    it("carica il logo nel campo 'logo'", async () => {
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: { hasCustomLogo: true } });

        await uploadLogo(new File(["png"], "logo.png"));

        const [url, body] = post.mock.calls[0] as [string, FormData];
        expect(url).toBe("/settings/logo");
        expect((body.get("logo") as File).name).toBe("logo.png");
    });

    it("pagina le righe di log del giorno, con 50 righe di default", async () => {
        const get = vi.spyOn(api, "get").mockResolvedValue({ data: { items: [] } });

        await listLogEntries("2026-09-11");
        await listLogEntries("2026-09-11", { page: 3, pageSize: 10, search: " login " });

        expect(get).toHaveBeenNthCalledWith(1, "/settings/logs/2026-09-11", {
            params: { page: 1, pageSize: 50, search: undefined },
        });
        expect(get).toHaveBeenNthCalledWith(2, "/settings/logs/2026-09-11", {
            params: { page: 3, pageSize: 10, search: "login" },
        });
        expect(getLogDownloadUrl("2026-09-11")).toContain("/settings/logs/2026-09-11/download");
    });
});

describe("api aggiornamenti e notifiche", () => {
    it("usa le rotte di aggiornamento", async () => {
        const get = vi.spyOn(api, "get").mockResolvedValue({ data: { state: "idle" } });
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: { state: "running" } });

        await getUpdateStatus();
        await getUpdateState();
        await runUpdateNow();
        await checkForUpdates();

        expect(get).toHaveBeenCalledWith("/settings/update");
        expect(get).toHaveBeenCalledWith("/settings/update-state");
        expect(post).toHaveBeenCalledWith("/settings/update/run");
        expect(post).toHaveBeenCalledWith("/settings/update/check");
    });

    it("elenca e chiude le notifiche di sistema", async () => {
        const get = vi.spyOn(api, "get").mockResolvedValue({ data: [{ id: 1 }] });
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: undefined });

        await expect(listNotifications()).resolves.toEqual([{ id: 1 }]);
        await dismissNotification(1);

        expect(get).toHaveBeenCalledWith("/notifications");
        expect(post).toHaveBeenCalledWith("/notifications/1/dismiss");
    });
});
