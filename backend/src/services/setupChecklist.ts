import { getBackupSettings } from "./backupManager";
import { isEmailConfigured } from "./emailManager";
import { createJsonSettingsStore } from "./jsonSettingsStore";

export type SetupStepKey = "company" | "email" | "backup";

export type SetupChecklist = {
    steps: Array<{ key: SetupStepKey; done: boolean }>;
    /** L'amministratore ha chiuso la guida: non va più mostrata, a prescindere dai passi. */
    dismissed: boolean;
};

type SetupProgressState = {
    dismissed: boolean;
    /**
     * I dati azienda hanno sempre un valore (i default del `.env`), quindi dal contenuto non si
     * capisce se qualcuno li ha mai controllati: conta il primo salvataggio dall'interfaccia.
     */
    companySaved: boolean;
};

const defaultState: SetupProgressState = { dismissed: false, companySaved: false };

const store = createJsonSettingsStore({
    fileName: "setup-progress.json",
    defaults: defaultState,
    sanitize: (input) => ({
        dismissed: input.dismissed === true,
        companySaved: input.companySaved === true,
    }),
});

/** Lo stato della guida "Primi passi": i passi si ricavano dalle impostazioni, non da un registro a parte. */
export const getSetupChecklist = async (): Promise<SetupChecklist> => {
    const [state, emailDone, backup] = await Promise.all([store.load(), isEmailConfigured(), getBackupSettings()]);

    return {
        steps: [
            { key: "company", done: state.companySaved },
            { key: "email", done: emailDone },
            { key: "backup", done: backup.autoEnabled },
        ],
        dismissed: state.dismissed,
    };
};

export const markCompanySaved = async (): Promise<void> => {
    const state = await store.load();

    if (!state.companySaved) {
        await store.save({ ...state, companySaved: true });
    }
};

export const dismissSetupChecklist = async (): Promise<void> => {
    const state = await store.load();
    await store.save({ ...state, dismissed: true });
};
