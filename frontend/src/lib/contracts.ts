import { formatDate } from "@/lib/utils";
import type {
    AssistanceType,
    ContractDto,
    ContractEffectiveStatus,
    ContractStatus,
    ContractTerm,
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

export const contractTermOptions: { value: ContractTerm; label: string; months: number }[] = [
    { value: "months_3", label: "3 mesi", months: 3 },
    { value: "months_6", label: "6 mesi", months: 6 },
    { value: "months_12", label: "12 mesi", months: 12 },
];

export const assistanceTypeOptions: { value: AssistanceType; label: string }[] = [
    { value: "remote", label: "Remota" },
    { value: "on_site", label: "In sede o in laboratorio" },
    { value: "complete", label: "Completa" },
    { value: "full_time", label: "Full time" },
];

/**
 * Le ore mensili che ogni pacchetto può includere: lo specchio della tabella del backend, che le
 * riapplica. `null` è "illimitate" (full time) e per quel pacchetto non c'è niente da scegliere.
 * Le ore valgono per mese di calendario e non si riportano al mese dopo.
 */
export const packageHours: Record<AssistanceType, readonly (number | null)[]> = {
    remote: [5, 10, 20],
    on_site: [10, 20, 30],
    complete: [100],
    full_time: [null],
};

/**
 * I tipi di intervento che consumano le ore di un pacchetto. La consegna di materiale non ne
 * consuma mai, qualunque pacchetto sia: non è assistenza.
 */
const consumedInterventionTypes: Record<AssistanceType, readonly InterventionType[]> = {
    remote: ["remote"],
    on_site: ["customer_site", "lab"],
    complete: ["remote", "customer_site", "lab"],
    full_time: ["remote", "customer_site", "lab"],
};

export const interventionTypesForAssistance = (type: AssistanceType): readonly InterventionType[] =>
    consumedInterventionTypes[type];

export const formatContractType = (value: ContractType) =>
    contractTypeOptions.find((option) => option.value === value)?.label ?? value;

export const formatContractStatus = (value: ContractEffectiveStatus) =>
    contractEffectiveStatusOptions.find((option) => option.value === value)?.label ?? value;

export const formatContractTerm = (value: ContractTerm) =>
    contractTermOptions.find((option) => option.value === value)?.label ?? value;

export const formatAssistanceType = (value: AssistanceType) =>
    assistanceTypeOptions.find((option) => option.value === value)?.label ?? value;

/** Le ore all'italiana: "3,5 h", senza decimali inutili ("10 h") e con al massimo due cifre. */
export const formatHours = (hours: number) => `${hours.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;

/** Il pacchetto di un contratto in una frase: "Remota - 10 h/mese", "Full time - ore illimitate". */
export const formatContractPackage = (contract: Pick<ContractDto, "type" | "assistance">) => {
    if (!contract.assistance) {
        return "-";
    }

    const { assistanceType, includedHours } = contract.assistance;
    const hours = includedHours == null ? "ore illimitate" : `${formatHours(includedHours)}/mese`;

    return `${formatAssistanceType(assistanceType)} - ${hours}`;
};

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

/**
 * Quanto del pacchetto del mese è stato consumato, in percentuale (anche oltre il 100). `null`
 * per le ore illimitate, dove una percentuale non ha senso.
 */
export const hoursUsagePercent = (usedHours: number, includedHours: number | null) =>
    includedHours == null || includedHours <= 0 ? null : (usedHours / includedHours) * 100;

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
    interventionTypesForAssistance(contract.assistance.assistanceType).includes(type);

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

/** Come un contratto compare nel menu dell'intervento: "Remota 10 h/mese - Notebook (fino al 01/12/2026)". */
export const formatContractOption = (contract: ContractDto) => {
    const assistance = contract.assistance
        ? `${formatAssistanceType(contract.assistance.assistanceType)}${
              contract.assistance.includedHours == null ? "" : ` ${formatHours(contract.assistance.includedHours)}/mese`
          }`
        : formatContractType(contract.type);

    return `#${contract.id} ${assistance} - ${contract.device} (fino al ${formatDate(contract.endDate)})`;
};
