import { assistancePackageKeys, type AssistancePackage, type InterventionType } from "../db/schema";

/**
 * Il listino dei pacchetti di assistenza: l'unica fonte di nome, ore, prezzo, priorità,
 * tipologia e interventi coperti. Uguale per ogni fornitore, prezzi IVA esclusa. Il database
 * conserva solo la chiave del pacchetto e una copia (snapshot) di ore e prezzo al momento della
 * creazione o del cambio di pacchetto: un listino futuro non tocca i contratti già firmati.
 */

export { assistancePackageKeys };
export type { AssistancePackage };

/** `month`: le ore si azzerano ogni mese di calendario; `contract`: valgono per tutto il contratto. */
export type AssistancePeriod = "month" | "contract";

export type AssistancePackageInfo = {
    key: AssistancePackage;
    name: string;
    includedHours: number;
    /** Prezzo IVA esclusa, in centesimi: al mese per `month`, unico per il contratto per `contract`. */
    priceCents: number;
    period: AssistancePeriod;
    /** 1 = la più alta. Solo descrittiva: nessuna regola sugli interventi. */
    priority: number;
    typology: string;
    coveredInterventionTypes: readonly InterventionType[];
};

/** La durata fissa, in mesi, dei pacchetti Supporto. */
export const supportTermMonths = 12;

const remoteTypes: readonly InterventionType[] = ["remote"];
const fullTypes: readonly InterventionType[] = ["remote", "customer_site", "lab"];
const remoteTypology = "Teleassistenza, solo software";
const fullTypology = "Teleassistenza, on site e in laboratorio: hardware, software, formazione";

/** Nell'ordine del listino. */
export const assistancePackages: readonly AssistancePackageInfo[] = [
    {
        key: "remote_20",
        name: "Assistenza Remota Pack 20",
        includedHours: 20,
        priceCents: 40000,
        period: "month",
        priority: 4,
        typology: remoteTypology,
        coveredInterventionTypes: remoteTypes,
    },
    {
        key: "remote_40",
        name: "Assistenza Remota Pack 40",
        includedHours: 40,
        priceCents: 72000,
        period: "month",
        priority: 4,
        typology: remoteTypology,
        coveredInterventionTypes: remoteTypes,
    },
    {
        key: "ready_20",
        name: "Pronti Via 20",
        includedHours: 20,
        priceCents: 50000,
        period: "month",
        priority: 3,
        typology: fullTypology,
        coveredInterventionTypes: fullTypes,
    },
    {
        key: "ready_40",
        name: "Pronti Via 40",
        includedHours: 40,
        priceCents: 90000,
        period: "month",
        priority: 3,
        typology: fullTypology,
        coveredInterventionTypes: fullTypes,
    },
    {
        key: "ready_60",
        name: "Pronti Via 60",
        includedHours: 60,
        priceCents: 123000,
        period: "month",
        priority: 3,
        typology: fullTypology,
        coveredInterventionTypes: fullTypes,
    },
    {
        key: "support_base",
        name: "Supporto Base",
        includedHours: 80,
        priceCents: 160000,
        period: "contract",
        priority: 2,
        typology: fullTypology,
        coveredInterventionTypes: fullTypes,
    },
    {
        key: "support_plus",
        name: "Supporto Plus",
        includedHours: 150,
        priceCents: 250000,
        period: "contract",
        priority: 1,
        typology: fullTypology,
        coveredInterventionTypes: fullTypes,
    },
];

export const getPackageInfo = (key: AssistancePackage): AssistancePackageInfo =>
    assistancePackages.find((entry) => entry.key === key) as AssistancePackageInfo;

/** Ore e prezzo da copiare sulla riga del contratto. */
export const packageSnapshot = (key: AssistancePackage) => {
    const { includedHours, priceCents } = getPackageInfo(key);

    return { includedHours, priceCents };
};

/** I pacchetti che durano sempre 12 mesi e contano le ore su tutto il contratto. */
export const isContractPeriodPackage = (key: AssistancePackage) => getPackageInfo(key).period === "contract";
