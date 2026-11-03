import { getBackupSettings } from "./backupManager";
import { getCompanySettings } from "./companyManager";
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

// I valori che scrivono `install.sh` e `edit-env.sh` quando nessuno ha ancora inserito i propri.
const placeholderCompany = {
    name: "EasyLab",
    email: "info@easylab.local",
    address: "Indirizzo laboratorio",
    phone: "+39 000 000 0000",
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
    const [state, emailDone, backup, company] = await Promise.all([
        store.load(),
        isEmailConfigured(),
        getBackupSettings(),
        getCompanySettings(),
    ]);
    // Un'installazione già in uso ha i dati compilati ma nessun salvataggio registrato qui.
    const companyDone =
        state.companySaved ||
        company.name !== placeholderCompany.name ||
        company.email !== placeholderCompany.email ||
        company.address !== placeholderCompany.address ||
        company.phone !== placeholderCompany.phone;

    return {
        steps: [
            { key: "company", done: companyDone },
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
