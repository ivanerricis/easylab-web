import { getCompanySettings } from "../services/companyManager";

// Le rotte leggono il fuso da qui, insieme agli altri dati del laboratorio.
export { getAppTimeZone } from "../services/companyManager";

export type LabConfig = {
    labName: string;
    labEmail: string;
    labAddress: string;
    labPhone: string;
    /** Il fuso in cui scrivere le date stampate: vedi `CompanySettingsState.timeZone`. */
    timeZone: string;
};

// I dati del laboratorio finiscono nell'intestazione di ogni PDF. Il logo non passa di qui:
// lo legge dal disco `loadPrintableLogo`.
export const getLabConfig = async (): Promise<LabConfig> => {
    const company = await getCompanySettings();

    return {
        labName: company.name,
        labEmail: company.email,
        labAddress: company.address,
        labPhone: company.phone,
        timeZone: company.timeZone,
    };
};
