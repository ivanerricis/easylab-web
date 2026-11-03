import type { AssistanceType, ContractStatus, ContractTerm, ContractType } from "../db/schema";

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

const contractTermLabels: Record<ContractTerm, string> = {
    months_3: "3 mesi",
    months_6: "6 mesi",
    months_12: "12 mesi",
};

const assistanceTypeLabels: Record<AssistanceType, string> = {
    remote: "Remota",
    on_site: "In sede o in laboratorio",
    complete: "Completa",
    full_time: "Full time",
};

export const formatContractType = (value: ContractType) => contractTypeLabels[value] ?? value;

export const formatContractStatus = (value: ContractStatus) => contractStatusLabels[value] ?? value;

export const formatContractTerm = (value: ContractTerm) => contractTermLabels[value] ?? value;

export const formatAssistanceType = (value: AssistanceType) => assistanceTypeLabels[value] ?? value;

/** "10 h", "7,5 h": formato italiano, al massimo due decimali. */
export const formatHours = (hours: number) => `${hours.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;

// Per esteso ("ottobre 2026"). Il mese non ha fuso: si legge e si scrive in UTC. Creato una
// volta sola, perché il costruttore di Intl è costoso.
const monthFormatter = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });

export const formatMonthLabel = (month: string) => monthFormatter.format(new Date(`${month}-01T00:00:00Z`));
