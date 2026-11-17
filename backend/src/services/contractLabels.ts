import type { ContractStatus, ContractType } from "../db/schema";
import { getPackageInfo, type AssistancePackage } from "./assistancePackages";

/**
 * Le etichette italiane di tipo, stato, durata e pacchetto di un contratto, per il PDF.
 * Specchio di `frontend/src/lib/contracts.ts`: i testi devono restare uguali a quelli della
 * pagina. Nessuna dipendenza (niente pdfmake), come `interventionLabels.ts`.
 */

const contractTypeLabels: Record<ContractType, string> = {
    assistance: "Assistenza",
    rental: "Noleggio",
};

const contractStatusLabels: Record<ContractStatus, string> = {
    draft: "Bozza",
    active: "Attivo",
    cancelled: "Annullato",
    expired: "Scaduto",
};

export const formatContractType = (value: ContractType) => contractTypeLabels[value] ?? value;

export const formatContractStatus = (value: ContractStatus) => contractStatusLabels[value] ?? value;

export const formatContractTerm = (months: number) => (months === 1 ? "1 mese" : `${months} mesi`);

/** Il periodo di fatturazione di un noleggio: "ogni mese", "ogni 3 mesi". */
export const formatBillingPeriod = (months: number) => (months === 1 ? "ogni mese" : `ogni ${months} mesi`);

/** Il nome del pacchetto dal listino ("Pronti Via 20"). */
export const formatPackageName = (value: AssistancePackage) => getPackageInfo(value).name;

/** "20 ore al mese" per i pacchetti mensili, "80 ore in 12 mesi" per i Supporto. */
export const formatIncludedHours = (hours: number, period: "month" | "contract") =>
    `${hours.toLocaleString("it-IT", { maximumFractionDigits: 2 })} ore ${period === "month" ? "al mese" : "in 12 mesi"}`;

// Le migliaia col punto anche a quattro cifre: `toLocaleString("it-IT")` le lascia senza.
const formatEuros = (cents: number) => {
    const [integer, decimals] = (cents / 100).toFixed(2).split(".");

    return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimals}`;
};

/** "400,00 € al mese + IVA" per i pacchetti mensili, "1.600,00 € + IVA" per i Supporto. */
export const formatPackagePrice = (priceCents: number, period: "month" | "contract") =>
    `${formatEuros(priceCents)} €${period === "month" ? " al mese" : ""} + IVA`;

/** "1 (massima)" per la priorità più alta, altrimenti il solo numero. */
export const formatPriority = (priority: number) => (priority === 1 ? "1 (massima)" : String(priority));

/** "10 h", "7,5 h": formato italiano, al massimo due decimali. */
export const formatHours = (hours: number) => `${hours.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;

// Per esteso ("ottobre 2026"). Il mese non ha fuso: si legge e si scrive in UTC. Creato una
// volta sola, perché il costruttore di Intl è costoso.
const monthFormatter = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });

export const formatMonthLabel = (month: string) => monthFormatter.format(new Date(`${month}-01T00:00:00Z`));
