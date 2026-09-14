import { getCompanySettings } from "../services/companyManager";

export type LabConfig = {
    labName: string;
    labEmail: string;
    labAddress: string;
    labPhone: string;
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
    };
};
