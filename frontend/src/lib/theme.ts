export type ThemeAccentPresetKey = "default" | "ocean" | "forest" | "amber" | "rose";

export type ThemeAccentPreset = {
    key: ThemeAccentPresetKey;
    label: string;
    description: string;
    primary: string;
    primaryForeground: string;
    sidebarPrimary: string;
    sidebarPrimaryForeground: string;
    ring: string;
    chart1: string;
    chart2: string;
    chart3: string;
    chart4: string;
    chart5: string;
};

export type TableRowIntensityKey = "soft" | "default" | "strong";

export type TableRowIntensity = {
    key: TableRowIntensityKey;
    label: string;
    description: string;
};

export type CornerRadiusKey = "square" | "default" | "round";

export type CornerRadiusPreset = {
    key: CornerRadiusKey;
    label: string;
    description: string;
    radius: string;
};

export type TableDensityKey = "compact" | "default" | "comfortable";

export type TableDensity = {
    key: TableDensityKey;
    label: string;
    description: string;
};

export type FontSizeKey = "sm" | "default" | "lg";

export type FontSize = {
    key: FontSizeKey;
    label: string;
    description: string;
};

/**
 * "Tutte le righe" espresso come numero, non come valore speciale tipo `"all"`.
 *
 * `pageSize` attraversa dodici pagine, i loro hook di caricamento, la query verso l'API e il
 * calcolo di "Visualizzati X-Y di Z": una stringa in mezzo a quei numeri avrebbe richiesto un
 * caso a parte in ognuno di quei punti. Con un numero grande non cambia niente a valle —
 * `totalPages` diventa 1, i controlli di pagina spariscono da soli, il conteggio dice
 * "Visualizzati 1-16 di 16" — e la risposta resta nella forma paginata `items + totalItems`
 * invece di quella non paginata (array semplice), che avrebbe voluto dire due forme di
 * risposta da gestire in ogni tabella.
 *
 * Il valore è lo stesso tetto del backend (`maxPageSize`, a sua volta `unpaginatedMaxRows`).
 * Oltre quelle righe "Tutte" non mostra davvero tutto, ma degrada bene: `totalPages` torna a
 * 2 e i controlli di pagina riappaiono, quindi le righe restano raggiungibili invece di
 * sparire in silenzio.
 */
export const allTableRowsPageSize = 5000;

export type TableRowsPerPageKey = 10 | 20 | 50 | typeof allTableRowsPageSize;

export type TableRowsPerPage = {
    key: TableRowsPerPageKey;
    label: string;
    description: string;
};

const accentStorageKey = "easylab-web-theme-accent";
const tableRowIntensityStorageKey = "easylab-web-table-row-intensity";
const tableRowIntensityAttribute = "data-table-row-intensity";
const cornerRadiusStorageKey = "easylab-web-corner-radius";
const defaultRadius = "0.3375rem";
const tableDensityStorageKey = "easylab-web-table-density";
const tableDensityAttribute = "data-table-density";
const fontSizeStorageKey = "easylab-web-font-size";
const fontSizeAttribute = "data-font-size";
const tableRowsPerPageStorageKey = "easylab-web-table-rows-per-page";
const tableColumnWidthsStorageKey = "easylab-web-table-column-widths";

export const cornerRadiusPresets: CornerRadiusPreset[] = [
    {
        key: "square",
        label: "Squadrato",
        description: "Angoli quasi dritti, stile tecnico.",
        radius: "0.125rem",
    },
    {
        key: "default",
        label: "Normale",
        description: "L'arrotondamento attuale dell'app.",
        radius: defaultRadius,
    },
    {
        key: "round",
        label: "Arrotondato",
        description: "Angoli più morbidi su card e pulsanti.",
        radius: "0.75rem",
    },
];

export const tableDensities: TableDensity[] = [
    {
        key: "compact",
        label: "Compatta",
        description: "Righe ravvicinate per vedere più dati insieme.",
    },
    {
        key: "default",
        label: "Normale",
        description: "Spaziatura standard delle righe.",
    },
    {
        key: "comfortable",
        label: "Comoda",
        description: "Righe più alte, più facili da leggere.",
    },
];

export const fontSizes: FontSize[] = [
    {
        key: "sm",
        label: "Piccolo",
        description: "Più contenuto visibile senza scorrere.",
    },
    {
        key: "default",
        label: "Medio",
        description: "Dimensione standard dell'app.",
    },
    {
        key: "lg",
        label: "Grande",
        description: "Testo più leggibile su schermi grandi.",
    },
];

export const tableRowsPerPageOptions: TableRowsPerPage[] = [
    {
        key: 10,
        label: "10",
        description: "Meno righe, pagine più veloci da scorrere.",
    },
    {
        key: 20,
        label: "20",
        description: "Compromesso tra scroll e numero di pagine.",
    },
    {
        key: 50,
        label: "50",
        description: "Più righe per pagina, meno cambi pagina.",
    },
    {
        key: allTableRowsPageSize,
        label: "Tutte",
        description: "Una pagina sola: si scorre invece di cambiare pagina.",
    },
];

export const tableRowIntensities: TableRowIntensity[] = [
    {
        key: "soft",
        label: "Tenue",
        description: "Sfondo velato e leggero.",
    },
    {
        key: "default",
        label: "Media",
        description: "Colore pieno con testo bianco.",
    },
    {
        key: "strong",
        label: "Intensa",
        description: "Colore carico e marcato.",
    },
];

export const themeAccentPresets: ThemeAccentPreset[] = [
    {
        key: "default",
        label: "Predefinito",
        description: "Mantiene il blu attuale dell'app.",
        primary: "#2A75B9",
        primaryForeground: "oklch(0.977 0.013 236.62)",
        sidebarPrimary: "#2A75B9",
        sidebarPrimaryForeground: "oklch(0.977 0.013 236.62)",
        ring: "oklch(0.705 0.015 286.067)",
        chart1: "oklch(0.78 0.16 84)",
        chart2: "oklch(0.72 0.18 152)",
        chart3: "oklch(0.68 0.16 32)",
        chart4: "oklch(0.64 0.15 195)",
        chart5: "oklch(0.58 0.14 18)",
    },
    {
        key: "ocean",
        label: "Oceano",
        description: "Toni più freddi e tecnici.",
        primary: "#0F766E",
        primaryForeground: "oklch(0.985 0 0)",
        sidebarPrimary: "#0F766E",
        sidebarPrimaryForeground: "oklch(0.985 0 0)",
        ring: "oklch(0.72 0.14 182)",
        chart1: "oklch(0.72 0.18 182)",
        chart2: "oklch(0.68 0.16 152)",
        chart3: "oklch(0.68 0.14 210)",
        chart4: "oklch(0.64 0.12 250)",
        chart5: "oklch(0.58 0.12 190)",
    },
    {
        key: "forest",
        label: "Bosco",
        description: "Verde professionale e pulito.",
        primary: "#2F855A",
        primaryForeground: "oklch(0.985 0 0)",
        sidebarPrimary: "#2F855A",
        sidebarPrimaryForeground: "oklch(0.985 0 0)",
        ring: "oklch(0.72 0.14 145)",
        chart1: "oklch(0.72 0.18 145)",
        chart2: "oklch(0.68 0.14 165)",
        chart3: "oklch(0.66 0.12 110)",
        chart4: "oklch(0.64 0.12 75)",
        chart5: "oklch(0.58 0.12 135)",
    },
    {
        key: "amber",
        label: "Ambra",
        description: "Caldo e molto visibile.",
        primary: "#B7791F",
        primaryForeground: "oklch(0.985 0 0)",
        sidebarPrimary: "#B7791F",
        sidebarPrimaryForeground: "oklch(0.985 0 0)",
        ring: "oklch(0.76 0.16 80)",
        chart1: "oklch(0.76 0.16 80)",
        chart2: "oklch(0.72 0.17 45)",
        chart3: "oklch(0.68 0.12 100)",
        chart4: "oklch(0.64 0.14 20)",
        chart5: "oklch(0.58 0.11 55)",
    },
    {
        key: "rose",
        label: "Rosa",
        description: "Accento deciso per il laboratorio.",
        primary: "#C05678",
        primaryForeground: "oklch(0.985 0 0)",
        sidebarPrimary: "#C05678",
        sidebarPrimaryForeground: "oklch(0.985 0 0)",
        ring: "oklch(0.7 0.16 350)",
        chart1: "oklch(0.7 0.16 350)",
        chart2: "oklch(0.66 0.14 20)",
        chart3: "oklch(0.62 0.12 320)",
        chart4: "oklch(0.6 0.12 30)",
        chart5: "oklch(0.56 0.1 355)",
    },
];

const getThemeRoot = () => document.documentElement;

export const getStoredThemeAccentPreset = () => {
    const storedValue = localStorage.getItem(accentStorageKey) as ThemeAccentPresetKey | null;

    return themeAccentPresets.some((preset) => preset.key === storedValue) ? storedValue : null;
};

export const setStoredThemeAccentPreset = (presetKey: ThemeAccentPresetKey | null) => {
    if (!presetKey || presetKey === "default") {
        localStorage.removeItem(accentStorageKey);
        return;
    }

    localStorage.setItem(accentStorageKey, presetKey);
};

export const applyThemeAccentPreset = (presetKey: ThemeAccentPresetKey | null) => {
    const root = getThemeRoot();

    if (!presetKey || presetKey === "default") {
        root.style.removeProperty("--primary");
        root.style.removeProperty("--primary-foreground");
        root.style.removeProperty("--sidebar-primary");
        root.style.removeProperty("--sidebar-primary-foreground");
        root.style.removeProperty("--ring");
        root.style.removeProperty("--chart-1");
        root.style.removeProperty("--chart-2");
        root.style.removeProperty("--chart-3");
        root.style.removeProperty("--chart-4");
        root.style.removeProperty("--chart-5");
        return;
    }

    const preset = themeAccentPresets.find((item) => item.key === presetKey);

    if (!preset) {
        return;
    }

    root.style.setProperty("--primary", preset.primary);
    root.style.setProperty("--primary-foreground", preset.primaryForeground);
    root.style.setProperty("--sidebar-primary", preset.sidebarPrimary);
    root.style.setProperty("--sidebar-primary-foreground", preset.sidebarPrimaryForeground);
    root.style.setProperty("--ring", preset.ring);
    root.style.setProperty("--chart-1", preset.chart1);
    root.style.setProperty("--chart-2", preset.chart2);
    root.style.setProperty("--chart-3", preset.chart3);
    root.style.setProperty("--chart-4", preset.chart4);
    root.style.setProperty("--chart-5", preset.chart5);
};

export const getStoredTableRowIntensity = () => {
    const storedValue = localStorage.getItem(tableRowIntensityStorageKey) as TableRowIntensityKey | null;

    return tableRowIntensities.some((intensity) => intensity.key === storedValue) ? storedValue : null;
};

export const setStoredTableRowIntensity = (intensityKey: TableRowIntensityKey | null) => {
    if (!intensityKey || intensityKey === "default") {
        localStorage.removeItem(tableRowIntensityStorageKey);
        return;
    }

    localStorage.setItem(tableRowIntensityStorageKey, intensityKey);
};

// I colori dei tre livelli stanno in index.css: qui basta marcare la radice, il default
// non ha bisogno di attributo perché è quello dichiarato su :root.
export const applyTableRowIntensity = (intensityKey: TableRowIntensityKey | null) => {
    const root = getThemeRoot();

    if (!intensityKey || intensityKey === "default") {
        root.removeAttribute(tableRowIntensityAttribute);
        return;
    }

    root.setAttribute(tableRowIntensityAttribute, intensityKey);
};

export const getStoredCornerRadius = () => {
    const storedValue = localStorage.getItem(cornerRadiusStorageKey) as CornerRadiusKey | null;

    return cornerRadiusPresets.some((preset) => preset.key === storedValue) ? storedValue : null;
};

export const setStoredCornerRadius = (radiusKey: CornerRadiusKey | null) => {
    if (!radiusKey || radiusKey === "default") {
        localStorage.removeItem(cornerRadiusStorageKey);
        return;
    }

    localStorage.setItem(cornerRadiusStorageKey, radiusKey);
};

export const applyCornerRadius = (radiusKey: CornerRadiusKey | null) => {
    const root = getThemeRoot();

    if (!radiusKey || radiusKey === "default") {
        root.style.removeProperty("--radius");
        return;
    }

    const preset = cornerRadiusPresets.find((item) => item.key === radiusKey);

    if (!preset) {
        return;
    }

    root.style.setProperty("--radius", preset.radius);
};

export const getStoredTableDensity = () => {
    const storedValue = localStorage.getItem(tableDensityStorageKey) as TableDensityKey | null;

    return tableDensities.some((density) => density.key === storedValue) ? storedValue : null;
};

export const setStoredTableDensity = (densityKey: TableDensityKey | null) => {
    if (!densityKey || densityKey === "default") {
        localStorage.removeItem(tableDensityStorageKey);
        return;
    }

    localStorage.setItem(tableDensityStorageKey, densityKey);
};

export const applyTableDensity = (densityKey: TableDensityKey | null) => {
    const root = getThemeRoot();

    if (!densityKey || densityKey === "default") {
        root.removeAttribute(tableDensityAttribute);
        return;
    }

    root.setAttribute(tableDensityAttribute, densityKey);
};

export const getStoredFontSize = () => {
    const storedValue = localStorage.getItem(fontSizeStorageKey) as FontSizeKey | null;

    return fontSizes.some((fontSize) => fontSize.key === storedValue) ? storedValue : null;
};

export const setStoredFontSize = (fontSizeKey: FontSizeKey | null) => {
    if (!fontSizeKey || fontSizeKey === "default") {
        localStorage.removeItem(fontSizeStorageKey);
        return;
    }

    localStorage.setItem(fontSizeStorageKey, fontSizeKey);
};

export const applyFontSize = (fontSizeKey: FontSizeKey | null) => {
    const root = getThemeRoot();

    if (!fontSizeKey || fontSizeKey === "default") {
        root.removeAttribute(fontSizeAttribute);
        return;
    }

    root.setAttribute(fontSizeAttribute, fontSizeKey);
};

const parseTableRowsPerPage = (rawValue: string | null): TableRowsPerPageKey | null => {
    const storedValue = Number(rawValue);

    return tableRowsPerPageOptions.find((option) => option.key === storedValue)?.key ?? null;
};

/**
 * Ogni tabella ha la sua chiave: il numero di righe è una scelta che dipende dalla pagina
 * (cento interventi hanno senso, cento dispositivi no), e prima era un'unica impostazione
 * globale sepolta in Impostazioni > Tema.
 *
 * Quando per quella tabella non c'è ancora un valore si ricade sulla vecchia chiave globale,
 * così chi l'aveva già configurata non se la vede resettare al primo aggiornamento. Per lo
 * stesso motivo qui il valore si scrive sempre, anche quando è 10: con il fallback attivo,
 * cancellare la chiave (come faceva la versione globale) significherebbe tornare al valore
 * legacy invece che al default.
 */
export const getStoredTableRowsPerPage = (tableKey: string): TableRowsPerPageKey => {
    const perTableValue = parseTableRowsPerPage(localStorage.getItem(`${tableRowsPerPageStorageKey}:${tableKey}`));

    if (perTableValue) {
        return perTableValue;
    }

    return parseTableRowsPerPage(localStorage.getItem(tableRowsPerPageStorageKey)) ?? 10;
};

export const setStoredTableRowsPerPage = (tableKey: string, pageSize: TableRowsPerPageKey) => {
    localStorage.setItem(`${tableRowsPerPageStorageKey}:${tableKey}`, String(pageSize));
};

/**
 * Larghezze delle colonne trascinate dall'utente, una mappa `chiave colonna -> pixel`.
 *
 * Come per le righe per pagina la chiave è per tabella, ma qui senza fallback su un valore
 * globale: una larghezza ha senso solo per la colonna che l'ha misurata, e "Cliente" negli
 * interventi non è la stessa colonna di "Cliente" nelle schede.
 *
 * Si salvano **solo** le colonne effettivamente ridimensionate: le altre restano senza voce
 * e ricadono sulla larghezza naturale misurata al primo render. Così una colonna aggiunta o
 * rinominata in seguito non eredita per sbaglio la misura di un'altra, e un `reset` è
 * semplicemente l'assenza della chiave.
 */
export const getStoredTableColumnWidths = (tableKey: string): Record<string, number> => {
    const rawValue = localStorage.getItem(`${tableColumnWidthsStorageKey}:${tableKey}`);

    if (!rawValue) {
        return {};
    }

    try {
        const parsedValue: unknown = JSON.parse(rawValue);

        if (typeof parsedValue !== "object" || parsedValue === null || Array.isArray(parsedValue)) {
            return {};
        }

        // Il contenuto arriva da localStorage, quindi può essere qualunque cosa: si tengono
        // solo le voci numeriche plausibili invece di fidarsi della forma salvata.
        return Object.fromEntries(
            Object.entries(parsedValue as Record<string, unknown>).filter(
                (entry): entry is [string, number] =>
                    typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0
            )
        );
    } catch {
        return {};
    }
};

export const setStoredTableColumnWidths = (tableKey: string, widths: Record<string, number>) => {
    const storageKey = `${tableColumnWidthsStorageKey}:${tableKey}`;

    if (Object.keys(widths).length === 0) {
        localStorage.removeItem(storageKey);
        return;
    }

    localStorage.setItem(storageKey, JSON.stringify(widths));
};
