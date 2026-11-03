import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();

vi.mock("node:fs", () => {
    const fsMock = {
        promises: {
            mkdir: vi.fn().mockResolvedValue(undefined),
            readFile: vi.fn(async (filePath: string) => {
                const content = files.get(filePath);
                if (content === undefined) {
                    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
                }
                return content;
            }),
            writeFile: vi.fn(async (filePath: string, content: string) => {
                files.set(filePath, content);
            }),
        },
    };
    return { default: fsMock, ...fsMock };
});
vi.mock("./backupManager", () => ({ getBackupSettings: vi.fn() }));
vi.mock("./emailManager", () => ({ isEmailConfigured: vi.fn() }));

import { getBackupSettings } from "./backupManager";
import { isEmailConfigured } from "./emailManager";
import { invalidateJsonSettingsCaches } from "./jsonSettingsStore";
import { dismissSetupChecklist, getSetupChecklist, markCompanySaved } from "./setupChecklist";

describe("setupChecklist", () => {
    beforeEach(() => {
        files.clear();
        invalidateJsonSettingsCaches();
        vi.mocked(isEmailConfigured).mockResolvedValue(false);
        vi.mocked(getBackupSettings).mockResolvedValue({ autoEnabled: false } as never);
    });

    it("a installazione nuova tutti i passi sono da fare e la guida non è chiusa", async () => {
        expect(await getSetupChecklist()).toEqual({
            steps: [
                { key: "company", done: false },
                { key: "email", done: false },
                { key: "backup", done: false },
            ],
            dismissed: false,
        });
    });

    it("i passi email e backup si ricavano dalle impostazioni vere", async () => {
        vi.mocked(isEmailConfigured).mockResolvedValue(true);
        vi.mocked(getBackupSettings).mockResolvedValue({ autoEnabled: true } as never);

        const { steps } = await getSetupChecklist();

        expect(steps.map((step) => step.done)).toEqual([false, true, true]);
    });

    it("il primo salvataggio dei dati azienda spunta il passo, anche dopo una rilettura dal disco", async () => {
        await markCompanySaved();
        invalidateJsonSettingsCaches();

        expect((await getSetupChecklist()).steps[0]).toEqual({ key: "company", done: true });
    });

    it("chiudere la guida non cancella i passi già fatti", async () => {
        await markCompanySaved();
        await dismissSetupChecklist();
        invalidateJsonSettingsCaches();

        const checklist = await getSetupChecklist();

        expect(checklist.dismissed).toBe(true);
        expect(checklist.steps[0].done).toBe(true);
    });
});
