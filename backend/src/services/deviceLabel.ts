/**
 * Da `User-Agent` a un'etichetta leggibile ("Chrome su Windows"), per far riconoscere una
 * sessione nell'elenco di Impostazioni → Utenti.
 *
 * È l'unico indizio sul dispositivo che il browser manda da sé: la tabella `session` non ha
 * (e non deve avere) nulla di più invasivo. È un'indicazione, non una prova — l'header lo
 * sceglie il client e può scrivere qualunque cosa — quindi resta un aiuto per la persona che
 * guarda l'elenco e non entra in nessuna decisione di sicurezza.
 *
 * Il riconoscimento è volutamente grossolano: nessuna versione, nessuna libreria di parsing
 * da tenere aggiornata. Per lo stesso motivo in tabella finisce l'header grezzo e la
 * traduzione avviene qui a ogni lettura: migliorare le regole migliora anche le sessioni
 * già aperte.
 */

/** Ordine non alfabetico: le stringhe si contengono a vicenda. Ogni browser derivato da
 * Chromium scrive anche "Chrome", e ogni Chromium scrive anche "Safari", quindi i più
 * specifici vanno provati per primi. */
const browsers: [string, RegExp][] = [
    ["Edge", /\bEdg(?:e|A|iOS)?\//],
    ["Opera", /\bOPR\/|\bOpera\b/],
    ["Samsung Internet", /\bSamsungBrowser\//],
    ["Firefox", /\bFirefox\/|\bFxiOS\//],
    ["Chrome", /\bChrome\/|\bCriOS\//],
    ["Safari", /\bSafari\//],
];

/** Stesso discorso: Android contiene "Linux", e l'iPad recente si presenta come "Macintosh". */
const systems: [string, RegExp][] = [
    ["Android", /\bAndroid\b/],
    ["iPhone", /\biPhone\b/],
    ["iPad", /\biPad\b/],
    ["Windows", /\bWindows NT\b/],
    ["Mac", /\bMacintosh\b|\bMac OS X\b/],
    ["ChromeOS", /\bCrOS\b/],
    ["Linux", /\bLinux\b/],
];

const findFirst = (candidates: [string, RegExp][], userAgent: string) =>
    candidates.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? null;

/**
 * `null` quando non si riconosce niente: meglio ammetterlo nell'interfaccia che inventare un
 * dispositivo, e capita per forza alle sessioni aperte prima che l'header venisse salvato.
 */
export const describeUserAgent = (userAgent: string | null | undefined): string | null => {
    if (!userAgent) {
        return null;
    }

    const browser = findFirst(browsers, userAgent);
    const system = findFirst(systems, userAgent);

    if (browser && system) {
        return `${browser} su ${system}`;
    }

    return browser ?? system;
};

/** Quanto ne entra in `session.user_agent`. */
const maxUserAgentLength = 255;

/**
 * L'header arriva dal client: prima di finire in tabella perde i caratteri di controllo — che
 * nel registro azioni o in un export spezzerebbero la riga — e viene tagliato alla lunghezza
 * della colonna, invece di far fallire l'inserimento e quindi il login.
 */
export const sanitizeUserAgent = (userAgent: string | null | undefined): string | null => {
    if (!userAgent) {
        return null;
    }

    // eslint-disable-next-line no-control-regex
    const cleaned = userAgent.replace(/[\u0000-\u001f\u007f]/g, " ").trim();

    return cleaned ? cleaned.slice(0, maxUserAgentLength) : null;
};
