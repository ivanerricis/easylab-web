import { euroFormatter, formatDate } from "@/lib/utils";
import type {
    AssistancePackage,
    AssistancePeriod,
    ContractDto,
    ContractEffectiveStatus,
    ContractStatus,
    ContractType,
    InterventionType,
} from "@/types/dtos";
import type { StatusColor } from "@/lib/statusColors";

export const contractTypeOptions: { value: ContractType; label: string }[] = [
    { value: "assistance", label: "Assistenza" },
    { value: "rental", label: "Noleggio" },
];

/** Gli stati che si possono scegliere nel modulo: "Scaduto" lo calcola il server, non si imposta. */
export const contractStatusOptions: { value: ContractStatus; label: string }[] = [
    { value: "draft", label: "Bozza" },
    { value: "active", label: "Attivo" },
    { value: "cancelled", label: "Annullato" },
];

/** Gli stati con cui si filtra e che si leggono in lista: qui "Scaduto" c'è. */
export const contractEffectiveStatusOptions: { value: ContractEffectiveStatus; label: string }[] = [
    ...contractStatusOptions,
    { value: "expired", label: "Scaduto" },
];

/** Le durate proposte dal modulo (durata e fatturazione): scorciatoie, si può scrivere anche un altro numero di mesi. */
export const monthsPresets = [3, 6, 12, 24] as const;

/** Il tetto dei mesi che il server accetta per durata e fatturazione. */
export const maxContractMonths = 120;

/** La durata fissa, in mesi, dei pacchetti Supporto: il server rifiuta qualunque altra. */
export const supportTermMonths = 12;

/** Il pacchetto con cui parte un contratto di assistenza nuovo: il primo del listino. */
export const defaultAssistancePackage: AssistancePackage = "remote_20";

/**
 * I tipi di intervento che consumano le ore di un pacchetto (lo specchio del listino del backend,
 * che li riapplica): l'assistenza remota solo gli interventi da remoto, gli altri anche quelli dal
 * cliente e in laboratorio. La consegna di materiale non ne consuma mai: non è assistenza.
 */
const consumedInterventionTypes: Record<AssistancePackage, readonly InterventionType[]> = {
    remote_20: ["remote"],
    remote_40: ["remote"],
    ready_20: ["remote", "customer_site", "lab"],
    ready_40: ["remote", "customer_site", "lab"],
    ready_60: ["remote", "customer_site", "lab"],
    support_base: ["remote", "customer_site", "lab"],
    support_plus: ["remote", "customer_site", "lab"],
};

export const interventionTypesForAssistance = (pack: AssistancePackage): readonly InterventionType[] =>
    consumedInterventionTypes[pack];

export const formatContractType = (value: ContractType) =>
    contractTypeOptions.find((option) => option.value === value)?.label ?? value;

export const formatContractStatus = (value: ContractEffectiveStatus) =>
    contractEffectiveStatusOptions.find((option) => option.value === value)?.label ?? value;

/**
 * La data di fine di un contratto ("AAAA-MM-GG"): l'inizio più i mesi di durata, con l'aritmetica di
 * Postgres (il 31 gennaio + 1 mese = 28 febbraio), la stessa con cui il server la calcola. `null`
 * se la data o i mesi non sono validi: serve al modulo, che la mostra prima del salvataggio.
 */
export const contractEndDate = (startDate: string, months: number): string | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);

    if (!match || !Number.isInteger(months) || months < 1 || months > maxContractMonths) {
        return null;
    }

    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const lastDayOfTargetMonth = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
    const end = new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDayOfTargetMonth)));

    return end.toISOString().slice(0, 10);
};

export const formatContractTerm = (months: number) => (months === 1 ? "1 mese" : `${months} mesi`);

/** Il periodo di fatturazione di un noleggio: "ogni mese", "ogni 3 mesi". */
export const formatBillingPeriod = (months: number) => (months === 1 ? "ogni mese" : `ogni ${months} mesi`);

/** Le ore all'italiana: "3,5 h", senza decimali inutili ("10 h") e con al massimo due cifre. */
export const formatHours = (hours: number) => `${hours.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;

type PackageTerms = { priceCents: number; period: AssistancePeriod; includedHours: number };

/** Il prezzo IVA esclusa: "400,00 € al mese + IVA" per i pacchetti mensili, "1.600,00 € + IVA" per il Supporto. */
export const formatPackagePrice = ({ priceCents, period }: Pick<PackageTerms, "priceCents" | "period">) =>
    `${euroFormatter.format(priceCents / 100)}${period === "month" ? " al mese" : ""} + IVA`;

/** Le ore incluse con il loro periodo: "20 ore al mese", "80 ore in 12 mesi". */
export const formatPackageHours = ({ includedHours, period }: Pick<PackageTerms, "includedHours" | "period">) =>
    `${includedHours.toLocaleString("it-IT", { maximumFractionDigits: 2 })} ore ${
        period === "month" ? "al mese" : `in ${supportTermMonths} mesi`
    }`;

/** La priorità d'intervento: la 1 è la più alta ("1 (massima)"), le altre solo il numero. */
export const formatPackagePriority = (priority: number) => (priority === 1 ? "1 (massima)" : String(priority));

/** Il pacchetto di un contratto: il nome del listino, "-" se non è un contratto di assistenza. */
export const formatContractPackage = (contract: Pick<ContractDto, "assistance">) => contract.assistance?.name ?? "-";

/**
 * Il colore dello stato di un contratto, per il badge e per la colonna ID delle tabelle, che come
 * nelle altre liste è sempre colorata. Annullato e scaduto sono rossi tutti e due: in entrambi i
 * casi il contratto non conta più.
 */
export const contractStatusColor = (value: ContractEffectiveStatus): StatusColor => {
    switch (value) {
        case "active":
            return "green";
        case "draft":
            return "yellow";
        case "expired":
        case "cancelled":
            return "red";
    }
};

/** Nome del documento stampato: la bozza è un preventivo, il resto un contratto. */
export const contractPrintName = (status: ContractEffectiveStatus) => (status === "draft" ? "preventivo" : "contratto");

/** Quanto del pacchetto è stato consumato, in percentuale (anche oltre il 100); `null` senza ore incluse. */
export const hoursUsagePercent = (usedHours: number, includedHours: number) =>
    includedHours <= 0 ? null : (usedHours / includedHours) * 100;

/** Le soglie con cui il backend avvisa il fornitore: lo stesso 80% e 100% che colorano la barra. */
export type HoursUsageLevel = "ok" | "warning" | "exceeded";

export const hoursUsageLevel = (percent: number | null): HoursUsageLevel => {
    if (percent == null || percent < 80) {
        return "ok";
    }

    return percent < 100 ? "warning" : "exceeded";
};

type InterventionContractContext = {
    type: InterventionType;
    /** "AAAA-MM-GG"; vuota finché non è stata scelta. */
    date: string;
};

/**
 * Se un contratto si può collegare a un intervento con questo tipo e questa data: assistenza,
 * attivo, data nell'intervallo [inizio, fine) — la fine è esclusa — e un tipo che il pacchetto
 * consuma. Il cliente lo garantisce chi carica l'elenco (`customerId`). È la stessa regola che
 * il backend riapplica: qui serve a offrire solo i contratti validi invece di far sbagliare.
 */
export const isContractLinkable = (
    contract: ContractDto,
    { type, date }: InterventionContractContext,
    { ignoreStatus = false }: { ignoreStatus?: boolean } = {}
) =>
    contract.type === "assistance" &&
    contract.assistance != null &&
    (ignoreStatus || contract.effectiveStatus === "active") &&
    date !== "" &&
    contract.startDate <= date &&
    date < contract.endDate &&
    interventionTypesForAssistance(contract.assistance.package).includes(type);

/**
 * `keepContractId`: il contratto già collegato a un intervento in modifica. Se nel frattempo è
 * scaduto (l'intervento è di un mese passato) resta fra le scelte, altrimenti aprire e salvare un
 * vecchio intervento lo scollegherebbe in silenzio; vale solo se tipo e data tornano ancora.
 */
export const linkableContracts = (
    contracts: readonly ContractDto[],
    context: InterventionContractContext,
    keepContractId: number | null = null
) =>
    contracts.filter((contract) =>
        isContractLinkable(contract, context, { ignoreStatus: contract.id === keepContractId })
    );

/**
 * Perché, per un cliente con contratti di assistenza attivi, nessuno si può collegare a questo
 * intervento: serve ai dialoghi per spiegarlo, invece di far sparire il menu senza una parola.
 * `null` se non c'è niente da dire: nessun contratto, data ancora da scegliere, consegna di
 * materiale (non è assistenza) o almeno un contratto valido.
 */
export const explainNoLinkableContract = (
    contracts: readonly ContractDto[],
    { type, date }: InterventionContractContext
): string | null => {
    if (contracts.length === 0 || date === "" || type === "material_delivery") {
        return null;
    }

    if (contracts.some((contract) => isContractLinkable(contract, { type, date }))) {
        return null;
    }

    const consuming = contracts.filter(
        (contract) =>
            contract.assistance != null && interventionTypesForAssistance(contract.assistance.package).includes(type)
    );

    if (consuming.length === 0) {
        return "Il tipo di intervento scelto non consuma le ore del contratto di assistenza del cliente.";
    }

    if (consuming.length === 1) {
        const [contract] = consuming;

        return `Il contratto #${contract.id} vale dal ${formatDate(contract.startDate)} al ${formatDate(contract.endDate)}: la data dell'intervento è fuori da questo periodo.`;
    }

    return "La data dell'intervento è fuori dal periodo dei contratti di assistenza del cliente.";
};

/** Come un contratto compare nel menu dell'intervento: "#4 Pronti Via 20 - Notebook (fino al 01/12/2026)". */
export const formatContractOption = (contract: ContractDto) =>
    `#${contract.id} ${contract.assistance?.name ?? formatContractType(contract.type)} - ${contract.device} (fino al ${formatDate(contract.endDate)})`;
