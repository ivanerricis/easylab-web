import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { growNaturalWidths, resolveWidthsToPersist, useResizableColumns } from "./useResizableColumns";

describe("growNaturalWidths", () => {
    it("allarga le colonne che ora non bastano e non stringe le altre", () => {
        expect(growNaturalWidths({ id: 44, customer: 200 }, { id: 58, customer: 150 })).toEqual({
            id: 58,
            customer: 200,
        });
    });

    it("torna null quando nessuna colonna deve cambiare, così non si ridisegna niente", () => {
        expect(growNaturalWidths({ id: 58, customer: 200 }, { id: 50, customer: 200 })).toBeNull();
    });
});

describe("resolveWidthsToPersist", () => {
    const columnKeys = ["id", "customer", "device", "actions"];

    it("salva anche le colonne mai trascinate, alla loro larghezza naturale", () => {
        const persisted = resolveWidthsToPersist(
            columnKeys,
            { id: 60, customer: 200, device: 140, actions: 180 },
            { customer: 320 },
            "actions"
        );

        // Il punto della funzione: senza "id" e "device" la volta successiva verrebbero
        // rimisurati sulle righe di allora, e la tabella tornerebbe diversa da come è stata
        // lasciata.
        expect(persisted).toEqual({ id: 60, customer: 320, device: 140 });
    });

    it("lascia fuori la colonna elastica, che non ha una larghezza propria", () => {
        const persisted = resolveWidthsToPersist(columnKeys, { id: 60, actions: 180 }, {}, "actions");

        expect(persisted).not.toHaveProperty("actions");
    });

    /** Una colonna nascosta dal menu "Colonne" non deve perdere la larghezza scelta. */
    it("tiene le larghezze delle colonne che ora non si vedono", () => {
        const persisted = resolveWidthsToPersist(
            ["id", "customer", "actions"],
            { id: 60, customer: 200, actions: 180 },
            { customer: 320, device: 150 },
            "actions"
        );

        expect(persisted).toEqual({ device: 150, id: 60, customer: 320 });
    });

    it("non inventa voci per le colonne di cui non si conosce ancora la larghezza", () => {
        const persisted = resolveWidthsToPersist(columnKeys, null, { customer: 320 }, "actions");

        expect(persisted).toEqual({ customer: 320 });
    });
});

/**
 * L'hook montato su una tabella vera. jsdom non impagina, quindi la larghezza che il browser
 * darebbe a ogni intestazione è simulata su `getBoundingClientRect`: `naturalWidths` è ciò che
 * "misura" il browser in questo momento, e un test può cambiarlo per simulare un font nuovo.
 */
const columns = [
    ["id", "N°"],
    ["customer", "Cliente"],
    ["device", "Dispositivo"],
    ["actions", "Azioni"],
] as const;

const columnKeys = columns.map(([key]) => key);

let naturalWidths: Record<string, number>;

const storageKey = "easylab-web-table-column-widths:prova";

const Harness = ({ canMeasure = true, dataVersion }: { canMeasure?: boolean; dataVersion?: unknown }) => {
    const { tableRef, isResizable, getColumnWidth, getResizeHandleProps, tableStyle } = useResizableColumns({
        tableKey: "prova",
        columnKeys,
        elasticColumnKey: "actions",
        canMeasure,
        dataVersion,
    });

    return (
        <table ref={tableRef} style={tableStyle} data-testid="tabella" data-resizable={isResizable}>
            <thead>
                <tr>
                    {columns.map(([key, label]) => {
                        const handle = getResizeHandleProps(key, label);
                        const width = getColumnWidth(key);

                        return (
                            <th key={key} data-key={key} data-width={width ?? ""}>
                                {label}
                                {handle ? <span {...handle} /> : null}
                            </th>
                        );
                    })}
                </tr>
            </thead>
        </table>
    );
};

const widthOf = (key: string) => {
    const value = document.querySelector<HTMLElement>(`th[data-key="${key}"]`)?.dataset.width;
    return value ? Number(value) : undefined;
};

const handle = (label: string) => screen.getByRole("separator", { name: `Ridimensiona colonna ${label}` });

const stored = () => JSON.parse(localStorage.getItem(storageKey) ?? "null") as Record<string, number> | null;

beforeEach(() => {
    localStorage.clear();
    naturalWidths = { id: 60, customer: 200, device: 140, actions: 180 };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        return { width: naturalWidths[this.dataset.key ?? ""] ?? 0 } as DOMRect;
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("useResizableColumns: misura", () => {
    it("finché non ci sono righe da misurare la tabella resta com'è, senza maniglie", () => {
        render(<Harness canMeasure={false} />);

        expect(screen.getByTestId("tabella")).toHaveAttribute("data-resizable", "false");
        expect(screen.getByTestId("tabella").style.tableLayout).toBe("");
        expect(screen.queryAllByRole("separator")).toHaveLength(0);
    });

    it("misurate le colonne passa a larghezze fisse, con la loro somma come minimo", () => {
        render(<Harness />);

        const table = screen.getByTestId("tabella");
        expect(table).toHaveAttribute("data-resizable", "true");
        expect(table.style.tableLayout).toBe("fixed");
        expect(table.style.minWidth).toBe("580px");
        expect(widthOf("customer")).toBe(200);
    });

    it("la colonna elastica non ha larghezza propria né maniglia", () => {
        render(<Harness />);

        expect(widthOf("actions")).toBeUndefined();
        expect(screen.getAllByRole("separator")).toHaveLength(3);
        expect(screen.queryByRole("separator", { name: "Ridimensiona colonna Azioni" })).not.toBeInTheDocument();
    });

    /** Nascosta su mobile la tabella misura zero: congelare quelle misure la renderebbe illeggibile. */
    it("una tabella non impaginata non viene congelata a larghezza zero", () => {
        naturalWidths = {};

        render(<Harness />);

        expect(screen.getByTestId("tabella")).toHaveAttribute("data-resizable", "false");
    });

    it("parte dalle larghezze salvate, e le altre colonne restano quelle misurate", () => {
        localStorage.setItem(storageKey, JSON.stringify({ customer: 320 }));

        render(<Harness />);

        expect(widthOf("customer")).toBe(320);
        expect(widthOf("device")).toBe(140);
        expect(screen.getByTestId("tabella").style.minWidth).toBe("700px");
    });
});

describe("useResizableColumns: misura a larghezza piena", () => {
    /**
     * La tabella ha `w-full`: misurata così com'è, il browser la stringeva nel contenitore e le
     * colonne restringibili nascevano già troncate. Durante la lettura deve essere a
     * `max-content` e in `auto`, e subito dopo tornare com'era.
     */
    it("legge le larghezze con la tabella a max-content e poi rimette lo stile di prima", () => {
        const seen: string[] = [];
        vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
            const table = this.closest("table");
            seen.push(`${table?.style.width}|${table?.style.tableLayout}`);
            return { width: naturalWidths[this.dataset.key ?? ""] ?? 0 } as DOMRect;
        });

        render(<Harness />);

        expect(new Set(seen)).toEqual(new Set(["max-content|auto"]));
        const table = screen.getByTestId("tabella");
        expect(table.style.width).toBe("");
        expect(table.style.tableLayout).toBe("fixed");
    });

    /** Su uno schermo largo l'avanzo non deve finire tutto alla colonna "Azioni". */
    it("se a max-content la tabella ci sta, tiene le larghezze distribuite dal browser", () => {
        const containerWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
        vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
            const isFullWidth = this.closest("table")?.style.width === "";
            const width = naturalWidths[this.dataset.key ?? ""] ?? 0;
            return { width: isFullWidth ? width * 1.5 : width } as DOMRect;
        });

        render(<Harness />);

        expect(widthOf("customer")).toBe(300);
        containerWidth.mockRestore();
    });

    it("se a max-content non ci sta, tiene le larghezze piene del contenuto", () => {
        const containerWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
        vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
            const isFullWidth = this.closest("table")?.style.width === "";
            const width = naturalWidths[this.dataset.key ?? ""] ?? 0;
            return { width: isFullWidth ? width / 2 : width } as DOMRect;
        });

        render(<Harness />);

        expect(widthOf("customer")).toBe(200);
        containerWidth.mockRestore();
    });

    it("arrotonda per eccesso, perché mezzo pixel in meno fa già comparire i puntini", () => {
        naturalWidths = { id: 57.2, customer: 200, device: 140, actions: 180 };

        render(<Harness />);

        expect(widthOf("id")).toBe(58);
    });
});

describe("useResizableColumns: cambio dei dati", () => {
    /** Gli ID a due cifre della prima pagina diventavano "6…" alla seconda. */
    it("con righe nuove allarga le colonne che non bastano più, senza stringere le altre", () => {
        const { rerender } = render(<Harness dataVersion="pagina-1" />);
        expect(widthOf("id")).toBe(60);

        naturalWidths = { id: 72, customer: 150, device: 140, actions: 180 };
        rerender(<Harness dataVersion="pagina-2" />);

        expect(widthOf("id")).toBe(72);
        expect(widthOf("customer")).toBe(200);
        expect(screen.getByTestId("tabella").style.minWidth).toBe("592px");
    });

    it("senza righe nuove non rimisura", () => {
        const { rerender } = render(<Harness dataVersion="pagina-1" />);

        naturalWidths = { id: 72, customer: 250, device: 140, actions: 180 };
        rerender(<Harness dataVersion="pagina-1" />);

        expect(widthOf("id")).toBe(60);
    });

    it("le larghezze scelte dall'utente restano quelle, anche se il contenuto cresce", () => {
        localStorage.setItem(storageKey, JSON.stringify({ id: 60, customer: 180, device: 140 }));
        const { rerender } = render(<Harness dataVersion="pagina-1" />);

        naturalWidths = { id: 72, customer: 250, device: 160, actions: 180 };
        rerender(<Harness dataVersion="pagina-2" />);

        expect(widthOf("id")).toBe(60);
        expect(widthOf("customer")).toBe(180);
    });
});

describe("useResizableColumns: trascinamento", () => {
    it("trascinare il bordo allarga la colonna e al rilascio salva l'intero layout", () => {
        render(<Harness />);

        fireEvent.pointerDown(handle("Cliente"), { button: 0, clientX: 100, pointerId: 1 });
        fireEvent.pointerMove(handle("Cliente"), { clientX: 160, pointerId: 1 });

        expect(widthOf("customer")).toBe(260);
        // Si scrive solo al rilascio, non a ogni pixel.
        expect(stored()).toBeNull();

        fireEvent.pointerUp(handle("Cliente"), { clientX: 160, pointerId: 1 });

        expect(stored()).toEqual({ id: 60, customer: 260, device: 140 });
    });

    it("non scende sotto la larghezza minima leggibile", () => {
        render(<Harness />);

        fireEvent.pointerDown(handle("N°"), { button: 0, clientX: 100, pointerId: 1 });
        fireEvent.pointerMove(handle("N°"), { clientX: -500, pointerId: 1 });
        fireEvent.pointerUp(handle("N°"), { pointerId: 1 });

        expect(widthOf("id")).toBe(56);
    });

    it("ignora il tasto destro e i movimenti senza un trascinamento in corso", () => {
        render(<Harness />);

        fireEvent.pointerMove(handle("Cliente"), { clientX: 400, pointerId: 1 });
        fireEvent.pointerDown(handle("Cliente"), { button: 2, clientX: 100, pointerId: 1 });
        fireEvent.pointerMove(handle("Cliente"), { clientX: 400, pointerId: 1 });
        fireEvent.pointerUp(handle("Cliente"), { pointerId: 1 });

        expect(widthOf("customer")).toBe(200);
        expect(stored()).toBeNull();
    });

    it("un trascinamento interrotto dal sistema salva quello che c'era", () => {
        render(<Harness />);

        fireEvent.pointerDown(handle("Dispositivo"), { button: 0, clientX: 0, pointerId: 1 });
        fireEvent.pointerMove(handle("Dispositivo"), { clientX: 20, pointerId: 1 });
        fireEvent.pointerCancel(handle("Dispositivo"), { pointerId: 1 });

        expect(stored()).toMatchObject({ device: 160 });
    });
});

describe("useResizableColumns: tastiera e doppio click", () => {
    it("le frecce spostano il bordo di 16 pixel e salvano subito", () => {
        render(<Harness />);

        fireEvent.keyDown(handle("Cliente"), { key: "ArrowRight" });
        fireEvent.keyDown(handle("Cliente"), { key: "ArrowRight" });
        fireEvent.keyDown(handle("Cliente"), { key: "ArrowLeft" });

        expect(widthOf("customer")).toBe(216);
        expect(stored()).toMatchObject({ customer: 216 });
    });

    it("gli altri tasti non fanno niente", () => {
        render(<Harness />);

        fireEvent.keyDown(handle("Cliente"), { key: "Enter" });

        expect(widthOf("customer")).toBe(200);
        expect(stored()).toBeNull();
    });

    it("il doppio click riporta la colonna alla larghezza misurata", () => {
        localStorage.setItem(storageKey, JSON.stringify({ id: 60, customer: 320, device: 140 }));
        render(<Harness />);

        fireEvent.doubleClick(handle("Cliente"));

        expect(widthOf("customer")).toBe(200);
        expect(stored()).toEqual({ id: 60, customer: 200, device: 140 });
    });
});

describe("useResizableColumns: caricamento dei font", () => {
    let fonts: EventTarget;

    beforeEach(() => {
        fonts = new EventTarget();
        Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
    });

    afterEach(() => {
        Reflect.deleteProperty(document, "fonts");
    });

    /** Misurate col font di ripiego, più stretto, le colonne resterebbero troncate per sempre. */
    it("rimisura una volta sola quando il font vero ha finito di caricare", () => {
        render(<Harness />);
        expect(widthOf("customer")).toBe(200);

        naturalWidths = { id: 64, customer: 210, device: 150, actions: 180 };
        act(() => {
            fonts.dispatchEvent(new Event("loadingdone"));
        });
        expect(widthOf("customer")).toBe(210);

        naturalWidths = { id: 90, customer: 300, device: 200, actions: 180 };
        act(() => {
            fonts.dispatchEvent(new Event("loadingdone"));
        });
        expect(widthOf("customer")).toBe(210);
    });

    it("le larghezze scelte dall'utente sopravvivono alla rimisurazione", () => {
        localStorage.setItem(storageKey, JSON.stringify({ customer: 320 }));
        render(<Harness />);

        naturalWidths = { id: 64, customer: 210, device: 150, actions: 180 };
        act(() => {
            fonts.dispatchEvent(new Event("loadingdone"));
        });

        expect(widthOf("customer")).toBe(320);
        expect(widthOf("device")).toBe(150);
    });
});
