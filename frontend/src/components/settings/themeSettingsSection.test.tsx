import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import ThemeSettingsSection from "./themeSettingsSection";

/**
 * Le scelte di questa sezione vivono in due posti: localStorage, perché sopravvivano al
 * ricaricamento, e l'elemento radice del documento (variabili CSS e attributi), perché
 * cambino l'aspetto subito. I test guardano entrambi, non lo stato interno del componente.
 */
const root = document.documentElement;

const renderSection = () =>
    render(
        <ThemeProvider>
            <ThemeSettingsSection />
        </ThemeProvider>
    );

/** Il riquadro con quel titolo: etichette come "Normale" compaiono in più riquadri. */
const card = (title: string) => {
    const element = screen.getByText(title).closest<HTMLElement>('[data-slot="card"]');

    if (!element) {
        throw new Error(`Riquadro "${title}" non trovato`);
    }

    return within(element);
};

// Dal testo esatto dell'etichetta al suo pulsante: il nome accessibile unisce etichetta,
// descrizione e anteprima ("AaMedio…") senza spazi, quindi non si presta a una ricerca per nome.
const option = (cardTitle: string, label: string) => {
    const button = card(cardTitle).getByText(label, { exact: true }).closest("button");

    if (!button) {
        throw new Error(`Voce "${label}" non trovata in "${cardTitle}"`);
    }

    return button;
};

/** La voce attiva è l'unica con il bordo evidenziato. */
const isHighlighted = (button: HTMLElement) => button.className.includes("border-primary ");

beforeEach(() => {
    localStorage.clear();
    root.removeAttribute("style");
    root.removeAttribute("class");
    root.removeAttribute("data-table-row-intensity");
    root.removeAttribute("data-table-density");
    root.removeAttribute("data-font-size");
});

describe("ThemeSettingsSection", () => {
    it("parte dai valori predefiniti quando non c'è niente di salvato", () => {
        renderSection();

        expect(isHighlighted(option("Modalità", "Sistema"))).toBe(true);
        expect(isHighlighted(option("Colore principale", "Predefinito"))).toBe(true);
        expect(isHighlighted(option("Raggio degli angoli", "Normale"))).toBe(true);
        expect(isHighlighted(option("Righe delle tabelle", "Cella ID"))).toBe(true);
        expect(isHighlighted(option("Densità tabelle", "Normale"))).toBe(true);
        expect(isHighlighted(option("Dimensione testo", "Medio"))).toBe(true);
    });

    it("riapre con le scelte salvate evidenziate", () => {
        localStorage.setItem("vite-ui-theme", "dark");
        localStorage.setItem("easylab-web-theme-accent", "forest");
        localStorage.setItem("easylab-web-corner-radius", "round");
        localStorage.setItem("easylab-web-table-row-intensity", "soft");
        localStorage.setItem("easylab-web-table-density", "compact");
        localStorage.setItem("easylab-web-font-size", "lg");

        renderSection();

        expect(isHighlighted(option("Modalità", "Scuro"))).toBe(true);
        expect(isHighlighted(option("Colore principale", "Bosco"))).toBe(true);
        expect(isHighlighted(option("Colore principale", "Predefinito"))).toBe(false);
        expect(isHighlighted(option("Raggio degli angoli", "Arrotondato"))).toBe(true);
        expect(isHighlighted(option("Righe delle tabelle", "Tenue"))).toBe(true);
        expect(isHighlighted(option("Densità tabelle", "Compatta"))).toBe(true);
        expect(isHighlighted(option("Dimensione testo", "Grande"))).toBe(true);
        expect(root.style.getPropertyValue("--primary")).toBe("#2F855A");
    });

    it("la modalità scura si applica subito e resta salvata", async () => {
        renderSection();

        await userEvent.click(option("Modalità", "Scuro"));

        expect(root.classList.contains("dark")).toBe(true);
        expect(localStorage.getItem("vite-ui-theme")).toBe("dark");
        expect(isHighlighted(option("Modalità", "Scuro"))).toBe(true);
        expect(isHighlighted(option("Modalità", "Sistema"))).toBe(false);
    });

    it('con "Sistema" segue il sistema operativo', async () => {
        localStorage.setItem("vite-ui-theme", "dark");
        renderSection();

        await userEvent.click(option("Modalità", "Sistema"));

        // Lo stub di matchMedia in setup.ts risponde "non scuro".
        expect(root.classList.contains("light")).toBe(true);
        expect(root.classList.contains("dark")).toBe(false);
    });

    it("un colore principale scrive le variabili CSS e si salva; il predefinito le toglie", async () => {
        renderSection();

        await userEvent.click(option("Colore principale", "Mattone"));

        expect(root.style.getPropertyValue("--primary")).toBe("#B34432");
        expect(root.style.getPropertyValue("--sidebar-primary")).toBe("#B34432");
        expect(localStorage.getItem("easylab-web-theme-accent")).toBe("brick");

        await userEvent.click(option("Colore principale", "Predefinito"));

        expect(root.style.getPropertyValue("--primary")).toBe("");
        expect(localStorage.getItem("easylab-web-theme-accent")).toBeNull();
    });

    it("il raggio degli angoli cambia la variabile --radius", async () => {
        renderSection();

        await userEvent.click(option("Raggio degli angoli", "Squadrato"));
        expect(root.style.getPropertyValue("--radius")).toBe("0.125rem");
        expect(localStorage.getItem("easylab-web-corner-radius")).toBe("square");

        await userEvent.click(option("Raggio degli angoli", "Normale"));
        expect(root.style.getPropertyValue("--radius")).toBe("");
        expect(localStorage.getItem("easylab-web-corner-radius")).toBeNull();
    });

    it("l'intensità delle righe marca la radice e l'anteprima mostra i tre stati", async () => {
        renderSection();

        await userEvent.click(option("Righe delle tabelle", "Intensa"));

        expect(root.getAttribute("data-table-row-intensity")).toBe("strong");
        expect(localStorage.getItem("easylab-web-table-row-intensity")).toBe("strong");
        const previewRows = card("Righe delle tabelle").getAllByRole("row");
        expect(previewRows.map((row) => row.getAttribute("data-status-color"))).toEqual(["red", "yellow", "green"]);
    });

    it("densità e dimensione del testo passano da attributi sulla radice", async () => {
        renderSection();

        await userEvent.click(option("Densità tabelle", "Comoda"));
        await userEvent.click(option("Dimensione testo", "Piccolo"));

        expect(root.getAttribute("data-table-density")).toBe("comfortable");
        expect(root.getAttribute("data-font-size")).toBe("sm");
        expect(localStorage.getItem("easylab-web-table-density")).toBe("comfortable");
        expect(localStorage.getItem("easylab-web-font-size")).toBe("sm");

        await userEvent.click(option("Densità tabelle", "Normale"));
        await userEvent.click(option("Dimensione testo", "Medio"));

        expect(root.hasAttribute("data-table-density")).toBe(false);
        expect(root.hasAttribute("data-font-size")).toBe(false);
    });

    it('"Ripristina predefiniti" azzera le cinque personalizzazioni ma non la modalità', async () => {
        localStorage.setItem("vite-ui-theme", "dark");
        renderSection();

        await userEvent.click(option("Colore principale", "Mattone"));
        await userEvent.click(option("Raggio degli angoli", "Squadrato"));
        await userEvent.click(option("Righe delle tabelle", "Intensa"));
        await userEvent.click(option("Densità tabelle", "Comoda"));
        await userEvent.click(option("Dimensione testo", "Piccolo"));

        await userEvent.click(screen.getByRole("button", { name: "Ripristina predefiniti" }));

        expect(isHighlighted(option("Colore principale", "Predefinito"))).toBe(true);
        expect(isHighlighted(option("Raggio degli angoli", "Normale"))).toBe(true);
        expect(isHighlighted(option("Righe delle tabelle", "Cella ID"))).toBe(true);
        expect(isHighlighted(option("Densità tabelle", "Normale"))).toBe(true);
        expect(isHighlighted(option("Dimensione testo", "Medio"))).toBe(true);
        expect(localStorage.getItem("easylab-web-theme-accent")).toBeNull();
        expect(localStorage.getItem("easylab-web-corner-radius")).toBeNull();
        expect(localStorage.getItem("easylab-web-table-row-intensity")).toBeNull();
        expect(localStorage.getItem("easylab-web-table-density")).toBeNull();
        expect(localStorage.getItem("easylab-web-font-size")).toBeNull();

        // La modalità è una scelta a sé: il reset dell'aspetto non la tocca.
        expect(isHighlighted(option("Modalità", "Scuro"))).toBe(true);
        expect(localStorage.getItem("vite-ui-theme")).toBe("dark");
    });
});
