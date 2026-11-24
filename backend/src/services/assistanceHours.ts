import {
    deleteAlerts,
    deleteAllAlerts,
    getAlertContext,
    getAssistancePackage,
    insertAlertIfMissing,
    sumUsedHours,
    sumUsedHoursByMonth,
    sumUsedHoursTotal,
} from "../db/queries/assistanceHours";
import type { AssistanceAlertKind, InterventionType } from "../db/schema";
import { getLabConfig } from "../config/lab";
import { getPackageInfo, type AssistancePackage, type AssistancePeriod } from "./assistancePackages";
import { isEmailConfigured, sendEmail } from "./emailManager";
import { recordNotification } from "./notificationManager";

/**
 * Le ore dei pacchetti di assistenza: quante ne sono state usate e gli avvisi al fornitore
 * all'80% e al 100%. I pacchetti con periodo `month` contano il mese di calendario di
 * `intervention_date`, senza riporto: il primo del mese si riparte da zero (e gli avvisi del
 * mese nuovo sono nuovi). I pacchetti Supporto (periodo `contract`) contano tutti gli interventi
 * del contratto, con un solo avviso per soglia in tutta la durata.
 */

/**
 * Quali tipi di intervento consuma un pacchetto (dal listino): da qui dipendono sia il conteggio
 * sia la validazione del collegamento. La consegna di materiale non consuma mai.
 */
export const consumingInterventionTypes = (pack: AssistancePackage): readonly InterventionType[] =>
    getPackageInfo(pack).coveredInterventionTypes;

/**
 * Le ore usate da un contratto di assistenza: nel mese (`YYYY-MM`) per i pacchetti mensili, in
 * tutto il contratto per i Supporto (il mese è ignorato); 0 per ogni altro contratto.
 */
export const getUsedHours = async (contractId: number, month: string) => {
    const assistance = await getAssistancePackage(contractId);

    if (!assistance) {
        return 0;
    }

    const types = consumingInterventionTypes(assistance.package);

    return getPackageInfo(assistance.package).period === "contract"
        ? sumUsedHoursTotal(contractId, types)
        : sumUsedHours(contractId, types, month);
};

export type MonthlyHours = { month: string; usedHours: number };

/**
 * Lo storico: un elemento per ogni mese in cui ci sono ore, più il mese corrente anche a zero
 * (la pagina mostra sempre "questo mese"), dal più recente.
 */
export const getMonthlyHours = async (contractId: number, currentMonth: string): Promise<MonthlyHours[]> => {
    const assistance = await getAssistancePackage(contractId);

    if (!assistance) {
        return [];
    }

    const months = await sumUsedHoursByMonth(contractId, consumingInterventionTypes(assistance.package));

    if (!months.some((entry) => entry.month === currentMonth)) {
        months.push({ month: currentMonth, usedHours: 0 });
    }

    return months.sort((a, b) => b.month.localeCompare(a.month));
};

const warningPercent = 80;

/** Le soglie raggiunte, confrontate in interi: niente 0,8 × ore con i suoi errori di virgola mobile. */
const reachedKinds = (usedHours: number, includedHours: number): AssistanceAlertKind[] => {
    const kinds: AssistanceAlertKind[] = [];

    if (usedHours * 100 >= includedHours * warningPercent) {
        kinds.push("warning");
    }

    if (usedHours >= includedHours) {
        kinds.push("exhausted");
    }

    return kinds;
};

// Per esteso ("ottobre 2026"): sta dentro una frase. Il mese non ha fuso, come i giorni.
const monthFormatter = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
const formatMonth = (month: string) => monthFormatter.format(new Date(`${month}-01T00:00:00Z`));
const formatHours = (hours: number) => hours.toLocaleString("it-IT", { maximumFractionDigits: 2 });

type AlertContent = { subject: string; text: string; title: string; message: string };

const buildAlertContent = (input: {
    kind: AssistanceAlertKind;
    labName: string;
    customerName: string;
    /** I nomi dei dispositivi coperti dal contratto: vuoto se il contratto non ne ha. */
    deviceNames: string[];
    contractId: number;
    package: AssistancePackage;
    month: string;
    usedHours: number;
    includedHours: number;
}): AlertContent => {
    const { name, period } = getPackageInfo(input.package);
    const perContract = period === "contract";
    const monthLabel = formatMonth(input.month);
    const used = formatHours(input.usedHours);
    const included = formatHours(input.includedHours);
    const pack = `${name} da ${included} ore ${perContract ? "in 12 mesi" : "al mese"}`;
    const exhausted = input.kind === "exhausted";
    const devices = input.deviceNames.join(", ");
    // Il Supporto conta sull'intero contratto: niente mese nei testi.
    const when = perContract ? "nel contratto" : `a ${monthLabel}`;

    const subject = exhausted
        ? `Ore di assistenza esaurite ${when} - ${input.customerName}`
        : `Ore di assistenza quasi esaurite ${when} - ${input.customerName}`;
    const outcome = perContract
        ? exhausted
            ? `Le ore del contratto sono esaurite: sono state usate ${used} ore su ${included}. Gli interventi successivi superano le ore incluse.`
            : `Sulle ore del contratto sono state usate ${used} ore su ${included}, oltre l'${warningPercent}% di quelle incluse.`
        : exhausted
          ? `Il pacchetto di ${monthLabel} è esaurito: sono state usate ${used} ore su ${included}. Gli interventi successivi in questo mese superano le ore incluse.`
          : `Nel mese di ${monthLabel} sono state usate ${used} ore su ${included}, oltre l'${warningPercent}% di quelle incluse.`;
    const text = [
        "Buongiorno,",
        `le scriviamo a proposito del contratto di ${pack} di ${input.customerName}${devices ? `, per ${devices}` : ""}.`,
        outcome,
        `Cordiali saluti,\n${input.labName}`,
    ].join("\n\n");

    return {
        subject,
        text,
        title: exhausted
            ? `Ore di assistenza esaurite: ${input.customerName}`
            : `Ore di assistenza all'${warningPercent}%: ${input.customerName}`,
        message: `Contratto n. ${input.contractId}${devices ? ` (${devices})` : ""}, ${perContract ? "ore del contratto" : monthLabel}: usate ${used} ore su ${included}.`,
    };
};

/**
 * Avvisa il fornitore; se l'email non è configurata o l'invio fallisce, l'avviso resta in app
 * come notifica (stessa chiave = un solo avviso per contratto, periodo e soglia). Non lancia mai:
 * una notifica non riuscita non deve far fallire l'intervento che l'ha provocata. Sono email di
 * sistema, quindi non passano dal limite orario degli invii manuali (`emailSendRateLimit`).
 */
const notifyThreshold = async (input: {
    kind: AssistanceAlertKind;
    contractId: number;
    package: AssistancePackage;
    month: string;
    usedHours: number;
    includedHours: number;
}) => {
    try {
        const context = await getAlertContext(input.contractId);

        if (!context) {
            return;
        }

        const { labName } = await getLabConfig();
        const content = buildAlertContent({
            ...input,
            labName,
            customerName: context.customerName ?? "",
            deviceNames: context.deviceNames,
        });
        let failure: string;

        if (await isEmailConfigured()) {
            try {
                await sendEmail({ to: context.providerEmail, subject: content.subject, text: content.text });
                return;
            } catch (error) {
                console.error("Impossibile inviare l'avviso delle ore di assistenza:", error);
                failure = "invio non riuscito";
            }
        } else {
            failure = "invio email non configurato";
        }

        await recordNotification({
            dedupeKey: `contract-hours-${input.contractId}-${input.month}-${input.kind}`,
            severity: "warning",
            title: content.title,
            message: `${content.message} Email al fornitore ${context.providerName} non inviata: ${failure}.`,
            link: `/contracts/${input.contractId}`,
        });
    } catch (error) {
        console.error("Impossibile notificare le ore di assistenza:", error);
    }
};

/**
 * Riallinea gli avvisi di un mese alle ore usate adesso. Va chiamata dopo ogni scrittura che può
 * cambiarle (intervento creato, modificato, tolto; pacchetto cambiato):
 * - le soglie raggiunte che non hanno ancora la riga la inseriscono, e solo chi l'inserisce
 *   avvisa: con due chiamate in parallelo la chiave primaria ne lascia passare una;
 * - le soglie non più raggiunte perdono la riga, così potranno scattare di nuovo.
 *
 * Un salto oltre il 100% inserisce entrambe le righe ma avvisa solo "esaurito": dire prima
 * "quasi esaurito" e subito dopo "esaurito" sarebbe rumore.
 *
 * Per i pacchetti Supporto il periodo è uno solo per tutto il contratto: `requestedMonth` (quello
 * dell'intervento, passato dai chiamanti) si ignora e si usa il primo giorno del mese di
 * `start_date`, sia come chiave dell'avviso sia nella chiave della notifica, altrimenti
 * l'avviso scatterebbe di nuovo ogni mese.
 */
export const checkAssistanceThresholds = async (contractId: number, requestedMonth: string) => {
    const assistance = await getAssistancePackage(contractId);

    if (!assistance) {
        return;
    }

    const { includedHours } = assistance;
    const types = consumingInterventionTypes(assistance.package);
    const perContract = getPackageInfo(assistance.package).period === "contract";
    const month = perContract ? assistance.startDate.slice(0, 7) : requestedMonth;
    const usedHours = perContract
        ? await sumUsedHoursTotal(contractId, types)
        : await sumUsedHours(contractId, types, month);
    const reached = reachedKinds(usedHours, includedHours);

    await deleteAlerts(
        contractId,
        month,
        (["warning", "exhausted"] as const).filter((kind) => !reached.includes(kind))
    );

    const inserted: AssistanceAlertKind[] = [];

    // Prima "warning", poi "exhausted": entrambe le righe, anche se l'email è una sola.
    for (const kind of reached) {
        if (await insertAlertIfMissing(contractId, month, kind)) {
            inserted.push(kind);
        }
    }

    const toNotify = inserted.includes("exhausted")
        ? "exhausted"
        : inserted.includes("warning") && !reached.includes("exhausted")
          ? "warning"
          : null;

    if (toNotify) {
        await notifyThreshold({
            kind: toNotify,
            contractId,
            package: assistance.package,
            month,
            usedHours,
            includedHours,
        });
    }
};

export type AssistanceHoursTarget = { contractId: number | null | undefined; month: string | null | undefined };

/**
 * Il punto d'ingresso per le rotte: ricontrolla ogni coppia (contratto, mese) una volta sola e
 * non lascia mai uscire un errore. L'intervento è già scritto: se il ricalcolo degli avvisi
 * fallisce (database momentaneamente irraggiungibile) la risposta resta un successo, e il
 * prossimo ricalcolo del mese rimette a posto gli avvisi.
 */
export const recheckAssistanceHours = async (targets: AssistanceHoursTarget[]) => {
    const unique = new Map<string, { contractId: number; month: string }>();

    for (const { contractId, month } of targets) {
        if (contractId != null && month) {
            unique.set(`${contractId}:${month}`, { contractId, month });
        }
    }

    for (const { contractId, month } of unique.values()) {
        try {
            await checkAssistanceThresholds(contractId, month);
        } catch (error) {
            console.error("Impossibile ricalcolare le ore di assistenza:", error);
        }
    }
};

/**
 * Al cambio di pacchetto le soglie sono altre (ore diverse, a volte un altro periodo): si tolgono
 * tutti gli avvisi del contratto e si ricalcolano da zero. Non lancia mai, come
 * `recheckAssistanceHours`.
 */
export const resetAssistanceAlerts = async (contractId: number, currentMonth: string) => {
    try {
        await deleteAllAlerts(contractId);
    } catch (error) {
        console.error("Impossibile azzerare gli avvisi delle ore di assistenza:", error);
        return;
    }

    await recheckAssistanceHours([{ contractId, month: currentMonth }]);
};

export type ContractHours = {
    period: AssistancePeriod;
    /** `YYYY-MM` per il periodo mensile, `null` per i pacchetti Supporto (tutto il contratto). */
    month: string | null;
    usedHours: number;
    includedHours: number;
    /** Negativo se si è oltre il pacchetto. */
    remainingHours: number;
};

/**
 * Il riquadro "ore" della pagina del contratto e il suo storico mensile. Per i pacchetti mensili
 * le ore usate sono quelle del mese corrente indicato; per i Supporto, la somma su tutto il contratto.
 */
export const getContractHoursSummary = async (
    contractId: number,
    pack: AssistancePackage,
    includedHours: number,
    currentMonth: string
) => {
    const { period } = getPackageInfo(pack);
    const monthlyHours = await getMonthlyHours(contractId, currentMonth);
    const usedHours =
        period === "contract"
            ? await sumUsedHoursTotal(contractId, consumingInterventionTypes(pack))
            : (monthlyHours.find((entry) => entry.month === currentMonth)?.usedHours ?? 0);
    const hours: ContractHours = {
        period,
        month: period === "contract" ? null : currentMonth,
        usedHours,
        includedHours,
        remainingHours: Math.round((includedHours - usedHours) * 100) / 100,
    };

    return { hours, monthlyHours };
};
