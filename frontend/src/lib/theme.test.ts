import { beforeEach, describe, expect, it } from "vitest";
import {
    applyCornerRadius,
    applyFontSize,
    applyTableDensity,
    applyThemeAccentPreset,
    getStoredCornerRadius,
    getStoredFontSize,
    getStoredTableDensity,
    getStoredTableRowsPerPage,
    getStoredThemeAccentPreset,
    setStoredTableRowsPerPage,
    setStoredThemeAccentPreset,
    themeAccentPresets,
} from "./theme";

beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-table-density");
    document.documentElement.removeAttribute("data-font-size");
});

describe("preferenze di tema salvate", () => {
    /**
     * Le chiavi arrivano da localStorage, che è modificabile a mano e sopravvive agli
     * aggiornamenti: un valore non più valido (una preferenza rimossa in una versione
     * successiva) non deve propagarsi come chiave sconosciuta al resto dell'app.
     */
    it("ignora un valore salvato che non corrisponde a nessun preset", () => {
        localStorage.setItem("easylab-web-theme-accent", "preset-inesistente");

        expect(getStoredThemeAccentPreset()).toBeNull();
    });

    it("restituisce il preset salvato quando è valido", () => {
        setStoredThemeAccentPreset("ocean");

        expect(getStoredThemeAccentPreset()).toBe("ocean");
    });

    /**
     * "default" non viene scritto: l'assenza della chiave È il default. Salvarlo
     * significherebbe congelare l'aspetto attuale anche se il default cambia.
     */
    it("non salva il valore predefinito", () => {
        setStoredThemeAccentPreset("ocean");
        setStoredThemeAccentPreset("default");

        expect(localStorage.getItem("easylab-web-theme-accent")).toBeNull();
        expect(getStoredThemeAccentPreset()).toBeNull();
    });

    it("rimuove la chiave quando il preset viene azzerato", () => {
        setStoredThemeAccentPreset("forest");
        setStoredThemeAccentPreset(null);

        expect(getStoredThemeAccentPreset()).toBeNull();
    });

    it("righe per pagina: default a 10 e valori non validi scartati", () => {
        expect(getStoredTableRowsPerPage("interventions")).toBe(10);

        localStorage.setItem("easylab-web-table-rows-per-page:interventions", "999");
        expect(getStoredTableRowsPerPage("interventions")).toBe(10);

        setStoredTableRowsPerPage("interventions", 50);
        expect(getStoredTableRowsPerPage("interventions")).toBe(50);

        setStoredTableRowsPerPage("interventions", 10);
        expect(getStoredTableRowsPerPage("interventions")).toBe(10);
    });

    it("righe per pagina: ogni tabella ha il suo valore", () => {
        setStoredTableRowsPerPage("interventions", 50);

        expect(getStoredTableRowsPerPage("interventions")).toBe(50);
        expect(getStoredTableRowsPerPage("devices")).toBe(10);
    });

    it("righe per pagina: si eredita la vecchia chiave globale finché la tabella non ha un valore suo", () => {
        localStorage.setItem("easylab-web-table-rows-per-page", "20");

        expect(getStoredTableRowsPerPage("interventions")).toBe(20);

        setStoredTableRowsPerPage("interventions", 10);

        expect(getStoredTableRowsPerPage("interventions")).toBe(10);
        expect(getStoredTableRowsPerPage("devices")).toBe(20);
    });

    it("densità e dimensione carattere non valide non vengono restituite", () => {
        localStorage.setItem("easylab-web-table-density", "gigante");
        localStorage.setItem("easylab-web-font-size", "enorme");

        expect(getStoredTableDensity()).toBeNull();
        expect(getStoredFontSize()).toBeNull();
    });

    it("raggio degli angoli non valido non viene restituito", () => {
        localStorage.setItem("easylab-web-corner-radius", "ovale");

        expect(getStoredCornerRadius()).toBeNull();
    });
});

/**
 * Contrasto secondo WCAG, calcolato dal valore esadecimale del colore.
 *
 * Serve a un test solo, ma è il test che rende sicuro aggiungere un colore nuovo: la scelta
 * si fa a occhio su uno schermo ben calibrato, e a occhio un colore troppo chiaro sotto il
 * testo bianco dei pulsanti sembra semplicemente "acceso".
 */
const relativeLuminance = (hex: string) => {
    const channels = [1, 3, 5]
        .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
        .map((value) => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)));

    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastWithWhite = (hex: string) => (1 + 0.05) / (relativeLuminance(hex) + 0.05);

describe("palette dei colori principali", () => {
    it("ogni preset ha chiave, etichetta e colore propri", () => {
        const chiavi = themeAccentPresets.map((preset) => preset.key);
        const etichette = themeAccentPresets.map((preset) => preset.label);
        const colori = themeAccentPresets.map((preset) => preset.primary.toLowerCase());

        expect(new Set(chiavi).size).toBe(chiavi.length);
        expect(new Set(etichette).size).toBe(etichette.length);
        expect(new Set(colori).size).toBe(colori.length);
    });

    it("ogni preset è accettato da localStorage e riletto identico", () => {
        for (const preset of themeAccentPresets) {
            localStorage.clear();
            setStoredThemeAccentPreset(preset.key);

            // Il predefinito è l'unico a non salvare niente: è l'assenza di preferenza.
            expect(getStoredThemeAccentPreset()).toBe(preset.key === "default" ? null : preset.key);
        }
    });

    /**
     * Ogni variabile è confrontata con il campo da cui deve arrivare, non solo con "non
     * vuota": così il test coglie anche un'assegnazione incrociata dentro
     * `applyThemeAccentPreset` (per esempio `--chart-4` scritta con `chart3`), che a valore
     * non vuoto passerebbe inosservata.
     */
    it("ogni preset scrive tutte e dieci le variabili CSS con i propri valori", () => {
        for (const preset of themeAccentPresets.filter((item) => item.key !== "default")) {
            document.documentElement.removeAttribute("style");
            applyThemeAccentPreset(preset.key);

            const attese: [string, string][] = [
                ["--primary", preset.primary],
                ["--primary-foreground", preset.primaryForeground],
                ["--sidebar-primary", preset.sidebarPrimary],
                ["--sidebar-primary-foreground", preset.sidebarPrimaryForeground],
                ["--ring", preset.ring],
                ["--chart-1", preset.chart1],
                ["--chart-2", preset.chart2],
                ["--chart-3", preset.chart3],
                ["--chart-4", preset.chart4],
                ["--chart-5", preset.chart5],
            ];

            for (const [variabile, atteso] of attese) {
                expect(document.documentElement.style.getPropertyValue(variabile), `${preset.key} ${variabile}`).toBe(
                    atteso
                );
            }
        }
    });

    /**
     * Sul colore principale ci va sopra il testo bianco dei pulsanti, che in quest'app è
     * grande (`text-lg`): la soglia WCAG per testo grande e componenti dell'interfaccia è 3.
     * Qui si tiene 3.5 come margine.
     *
     * Nota: il preset "Ambra" è il più debole della palette (3.64) e non passerebbe la soglia
     * 4.5 richiesta per il testo piccolo. È preesistente e volutamente lasciato com'è —
     * cambiarlo cambierebbe il colore a chi l'ha già scelto.
     */
    it("ogni colore principale regge il testo bianco che ci va sopra", () => {
        for (const preset of themeAccentPresets) {
            expect(contrastWithWhite(preset.primary), `${preset.key} (${preset.primary})`).toBeGreaterThanOrEqual(3.5);
        }
    });
});

describe("applicazione del tema al DOM", () => {
    it("scrive le variabili CSS del preset scelto", () => {
        const ocean = themeAccentPresets.find((preset) => preset.key === "ocean");
        expect(ocean).toBeDefined();

        applyThemeAccentPreset("ocean");

        const root = document.documentElement;
        expect(root.style.getPropertyValue("--primary")).toBe(ocean!.primary);
        expect(root.style.getPropertyValue("--ring")).toBe(ocean!.ring);
        expect(root.style.getPropertyValue("--chart-1")).toBe(ocean!.chart1);
    });

    /**
     * Tornare al default deve rimuovere le variabili inline, non riscriverle con i valori
     * del tema chiaro: altrimenti il tema scuro resterebbe con i colori di quello chiaro.
     */
    it("rimuove le variabili CSS tornando al preset predefinito", () => {
        applyThemeAccentPreset("rose");
        applyThemeAccentPreset("default");

        const root = document.documentElement;
        expect(root.style.getPropertyValue("--primary")).toBe("");
        expect(root.style.getPropertyValue("--sidebar-primary")).toBe("");
        expect(root.style.getPropertyValue("--chart-5")).toBe("");
    });

    it("ignora un preset sconosciuto senza toccare il DOM", () => {
        applyThemeAccentPreset("ocean");
        const before = document.documentElement.style.getPropertyValue("--primary");

        applyThemeAccentPreset("non-esiste" as never);

        expect(document.documentElement.style.getPropertyValue("--primary")).toBe(before);
    });

    it("densità e dimensione carattere passano da attributi sull'elemento radice", () => {
        applyTableDensity("compact");
        applyFontSize("lg");

        expect(document.documentElement.getAttribute("data-table-density")).toBe("compact");
        expect(document.documentElement.getAttribute("data-font-size")).toBe("lg");

        applyTableDensity("default");
        applyFontSize("default");

        expect(document.documentElement.getAttribute("data-table-density")).toBeNull();
        expect(document.documentElement.getAttribute("data-font-size")).toBeNull();
    });

    it("il raggio degli angoli scrive la variabile --radius", () => {
        applyCornerRadius("round");

        expect(document.documentElement.style.getPropertyValue("--radius")).not.toBe("");
    });
});
