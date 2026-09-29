// Le funzioni passate a `page.evaluate` girano nel browser e usano il DOM: il tsconfig di
// `e2e/` (tsconfig.node.json) non ne ha i tipi, perché il resto dei test gira in Node.
/// <reference lib="dom" />
import { expect, test, type Page } from "@playwright/test";
import { ApiResponse, mockApi, type ApiHandler } from "./support/mockApi";

/**
 * Il percorso di tutti i giorni sui report, nel browser vero contro l'API simulata: creare un
 * report con un cliente nuovo, aprirne uno dalla lista filtrata e tornare indietro ritrovando
 * ricerca, filtro, pagina e posizione di scorrimento, modificarlo ed eliminarlo tornando alla
 * stessa lista. Le parti singole hanno i loro test in jsdom; qui si prova che stanno insieme,
 * con la cronologia, lo scorrimento e l'impaginazione veri.
 */

const devices = [
    { id: 1, name: "iPhone 13", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null },
    { id: 2, name: "Samsung Galaxy S21", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null },
];
const issues = [
    { id: 1, description: "Batteria", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null },
    { id: 2, description: "Schermo rotto", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null },
];

type MockReport = {
    id: number;
    customerId: number;
    customer: string;
    customerPhone: string | null;
    deviceId: number;
    issueId: number;
    password: string | null;
    note: string | null;
    charger: boolean;
    dataBackup: boolean;
    closed: boolean;
};

const deviceName = (id: number) => devices.find((device) => device.id === id)?.name ?? "";
const issueName = (id: number) => issues.find((issue) => issue.id === id)?.description ?? "";

/** La riga della lista (`ReportDto`). */
const toListRow = (report: MockReport) => ({
    ...report,
    collaboratorId: null,
    issueDescription: null,
    serviceDescription: null,
    alerted: false,
    paymentMethod: "non_paid",
    price: 0,
    device: deviceName(report.deviceId),
    issue: issueName(report.issueId),
    collaborator: "",
    technicianName: null,
    technicianPrice: 0,
    totalPrice: 0,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: null,
});

/** La scheda (`ReportDetailDto`). */
const toDetail = (report: MockReport) => ({
    id: report.id,
    note: report.note,
    password: report.password,
    issueDescription: null,
    serviceDescription: null,
    dataBackup: report.dataBackup,
    charger: report.charger,
    alerted: false,
    closed: report.closed,
    price: 0,
    paymentMethod: "non_paid",
    deviceId: report.deviceId,
    issueId: report.issueId,
    collaboratorId: null,
    customerId: report.customerId,
    created_at: "2026-09-01T09:00:00.000Z",
    updated_at: null,
    technicianId: null,
    technicianPrice: 0,
    technicianName: null,
    customerName: report.customer,
    customerPhone: report.customerPhone,
    deviceName: deviceName(report.deviceId),
    issueName: issueName(report.issueId),
    collaboratorName: null,
    totalPrice: 0,
});

/**
 * Un backend dei report con uno stato: la lista filtra, cerca e pagina come quello vero, e
 * creazione, modifica ed eliminazione la cambiano davvero. `mockApi` risponde a chiavi esatte,
 * quindi le rotte con l'id si preparano per tutti gli id possibili.
 */
const reportsBackend = (initial: MockReport[]) => {
    const reports = [...initial];
    const maxId = 200;

    const byId = (id: number) => reports.find((report) => report.id === id);

    const handlers: Record<string, ApiHandler> = {
        "GET /api/reports": ({ url }) => {
            const search = (url.searchParams.get("search") ?? "").toLowerCase();
            const visibility = url.searchParams.get("visibility") ?? "all";
            const page = Number(url.searchParams.get("page") ?? 1);
            const pageSize = Number(url.searchParams.get("pageSize") ?? 10);
            const matching = reports.filter(
                (report) =>
                    report.customer.toLowerCase().includes(search) &&
                    (visibility === "all" || report.closed === (visibility === "closed"))
            );

            return {
                items: matching.slice((page - 1) * pageSize, page * pageSize).map(toListRow),
                totalItems: matching.length,
                page,
                pageSize,
                totalPages: Math.max(1, Math.ceil(matching.length / pageSize)),
            };
        },
        "GET /api/devices": () => devices,
        "GET /api/issues": () => issues,
        "POST /api/customers": ({ body }) => ({
            id: 900,
            ...(body as object),
            createdAt: "2026-09-01T09:00:00.000Z",
            updatedAt: null,
        }),
        "POST /api/reports": ({ body }) => {
            const input = body as { customerId: number; deviceId: number; issueId: number } & Partial<MockReport>;
            const report: MockReport = {
                id: Math.max(0, ...reports.map((item) => item.id)) + 1,
                customerId: input.customerId,
                customer: "Giulia Verdi",
                customerPhone: "333 1234567",
                deviceId: input.deviceId,
                issueId: input.issueId,
                password: input.password ?? null,
                note: input.note ?? null,
                charger: input.charger ?? false,
                dataBackup: input.dataBackup ?? false,
                closed: false,
            };
            // In testa, come l'ordinamento predefinito (i più recenti prima).
            reports.unshift(report);
            return toDetail(report);
        },
    };

    for (let id = 1; id <= maxId; id++) {
        handlers[`GET /api/reports/${id}`] = () => {
            const report = byId(id);
            return report ? toDetail(report) : new ApiResponse(404, { message: "Report non trovato" });
        };
        handlers[`PUT /api/reports/${id}`] = ({ body }) => {
            const report = byId(id);
            if (!report) {
                return new ApiResponse(404, { message: "Report non trovato" });
            }
            Object.assign(report, body as Partial<MockReport>);
            return toDetail(report);
        };
        handlers[`DELETE /api/reports/${id}`] = () => {
            const index = reports.findIndex((report) => report.id === id);
            if (index === -1) {
                return new ApiResponse(404, { message: "Report non trovato" });
            }
            const [removed] = reports.splice(index, 1);
            return toDetail(removed);
        };
    }

    return { handlers, reports };
};

/** 50 report di clienti "Rossi" (aperti e chiusi) e qualche "Bianchi" che la ricerca esclude. */
const seedReports = (): MockReport[] =>
    Array.from({ length: 56 }, (_, index) => {
        const id = index + 1;
        const isRossi = id <= 50;

        return {
            id,
            customerId: 100 + id,
            customer: isRossi ? `Mario Rossi ${id}` : `Anna Bianchi ${id}`,
            customerPhone: `333 00000${String(id).padStart(2, "0")}`,
            deviceId: 1,
            issueId: 1,
            password: null,
            note: null,
            charger: false,
            dataBackup: false,
            // Uno su cinque chiuso: col filtro "Tutti i report" devono comparire anche quelli.
            closed: id % 5 === 3,
        };
    });

/**
 * Il contenitore che fa scorrere la lista (su desktop quello della tabella, ma lo si cerca
 * risalendo invece di presumerlo: vedi `getListScrollContainers`), portato in fondo. Restituisce
 * quanti livelli sopra il contenitore della tabella sta, per ritrovarlo dopo che la lista è
 * stata smontata e rimontata, e la posizione raggiunta.
 */
const scrollListToBottom = (page: Page) =>
    page.evaluate(() => {
        let element = document.querySelector("[data-slot='table-container']");
        for (let depth = 0; element instanceof HTMLElement; depth++, element = element.parentElement) {
            if (element.scrollHeight > element.clientHeight + 1) {
                element.scrollTop = element.scrollHeight;
                return { depth, top: element.scrollTop };
            }
        }
        throw new Error("Nessun contenitore della lista scorre: servono più righe");
    });

const listScrollTop = (page: Page, depth: number) =>
    page.evaluate((levels) => {
        let element = document.querySelector("[data-slot='table-container']");
        for (let level = 0; level < levels && element; level++) {
            element = element.parentElement;
        }
        return element?.scrollTop ?? -1;
    }, depth);

/** Le righe per pagina si ricordano per tabella: 20, così la seconda pagina scorre di sicuro. */
const useTwentyRowsPerPage = (page: Page) =>
    page.addInitScript(() => localStorage.setItem("easylab-web-table-rows-per-page:reports", "20"));

test("crea un report con un cliente nuovo, scegliendo dispositivo e difetto dai suggerimenti", async ({ page }) => {
    const backend = reportsBackend(seedReports());
    const api = await mockApi(page, { handlers: backend.handlers });

    await page.goto("/reports");
    await page.getByRole("button", { name: "Crea nuovo report" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuovo report" });
    await expect(dialog).toBeVisible();

    // Il cliente non esiste: lo si crea dal "+" accanto al campo, senza uscire dal report.
    await dialog.getByRole("button", { name: "Crea nuovo cliente" }).click();
    const customerDialog = page.getByRole("dialog", { name: "Nuovo cliente" });
    await customerDialog.getByLabel("Nome (Nome azienda)").fill("Giulia");
    await customerDialog.getByLabel("Cognome").fill("Verdi");
    await customerDialog.getByLabel("Telefono 1").fill("333 1234567");
    await customerDialog.getByRole("button", { name: "Salva" }).click();

    await expect(customerDialog).toBeHidden();
    await expect(dialog.getByRole("combobox", { name: /Cliente/ })).toHaveValue("Giulia Verdi - 333 1234567");

    // Dispositivo: si scrive per cercare, e si sceglie la voce della lista.
    const deviceField = dialog.getByRole("combobox", { name: /Tipologia dispositivo/ });
    await deviceField.fill("iph");
    await expect(deviceField).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("option", { name: "iPhone 13" }).click();
    await expect(deviceField).toHaveValue("iPhone 13");

    // Difetto: al focus mostra tutto il catalogo; qui si sceglie con la tastiera.
    const issueField = dialog.getByRole("combobox", { name: /Difetto/ });
    await issueField.click();
    await expect(page.getByRole("option", { name: "Schermo rotto" })).toBeVisible();
    await issueField.press("ArrowDown");
    await issueField.press("ArrowDown");
    await expect(issueField).toHaveAttribute("aria-activedescendant", /.+/);
    await issueField.press("Enter");
    await expect(issueField).toHaveValue("Schermo rotto");

    await dialog.locator("#charger").click();
    await page.getByRole("option", { name: "Sì" }).click();
    await dialog.locator("#dataBackup").click();
    await page.getByRole("option", { name: "No" }).click();

    await dialog.getByRole("button", { name: "Salva" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText("Report #57 creato")).toBeVisible();
    // La lista si è ricaricata e il report nuovo c'è.
    await expect(page.getByRole("link", { name: "Apri report 57" })).toBeVisible();

    expect(api.calls("POST /api/customers")).toEqual([
        expect.objectContaining({ firstName: "Giulia", lastName: "Verdi", phoneNumber: "333 1234567" }),
    ]);
    expect(api.calls("POST /api/reports")).toEqual([
        {
            customerId: 900,
            deviceId: 1,
            issueId: 2,
            note: null,
            password: null,
            issueDescription: null,
            charger: true,
            dataBackup: false,
        },
    ]);
    expect(api.unhandled).toEqual([]);
});

test("la lista filtrata si ritrova tornando dal dettaglio, e modifica ed eliminazione riportano lì", async ({
    page,
}) => {
    const backend = reportsBackend(seedReports());
    const api = await mockApi(page, { handlers: backend.handlers });
    await useTwentyRowsPerPage(page);

    // Il filtro arriva dall'indirizzo (come dai collegamenti della dashboard), ricerca e pagina
    // dall'interfaccia.
    await page.goto("/reports?visibility=all");
    await page.getByRole("searchbox", { name: "Cerca report..." }).fill("rossi");
    await expect(page).toHaveURL(/[?&]q=rossi/);
    await expect(page.getByRole("link", { name: "Apri report 51" })).toHaveCount(0);

    await page.getByRole("button", { name: "Vai alla pagina 2" }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    // Seconda pagina: dal 21 al 40, chiusi compresi (il 23 lo è).
    await expect(page.getByRole("link", { name: "Apri report 23" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Apri report 20" })).toHaveCount(0);
    const listUrl = page.url();

    // In fondo alla pagina, e si apre l'ultimo report.
    const scrolled = await scrollListToBottom(page);
    expect(scrolled.top).toBeGreaterThan(0);
    // Il salvataggio della posizione aspetta un frame: si lascia passare prima di uscire.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.getByRole("link", { name: "Apri report 40" }).click();

    await expect(page).toHaveURL(/\/reports\/40$/);
    await expect(page.getByText("Mario Rossi 40").first()).toBeVisible();

    // "Indietro" del browser: stessa ricerca, stesso filtro, stessa pagina, stesso punto.
    await page.goBack();
    await expect(page).toHaveURL(listUrl);
    await expect(page.getByRole("searchbox", { name: "Cerca report..." })).toHaveValue("rossi");
    await expect(page.getByRole("link", { name: "Apri report 40" })).toBeVisible();
    await expect.poll(() => listScrollTop(page, scrolled.depth)).toBe(scrolled.top);

    // Modifica dalla scheda.
    await page.getByRole("link", { name: "Apri report 40" }).click();
    await expect(page).toHaveURL(/\/reports\/40$/);
    await page.getByRole("button", { name: "Modifica report" }).click();
    const editDialog = page.getByRole("dialog", { name: "Modifica report #40" });
    const passwordField = editDialog.getByLabel("Password sblocco");
    await expect(passwordField).toBeVisible();
    await passwordField.fill("1234");
    await editDialog.getByLabel("Note").fill("Graffio sul retro");
    await editDialog.getByRole("button", { name: "Salva" }).click();

    await expect(editDialog).toBeHidden();
    await expect(page.getByText("Graffio sul retro")).toBeVisible();
    expect(api.calls("PUT /api/reports/40")).toEqual([
        expect.objectContaining({ password: "1234", note: "Graffio sul retro", deviceId: 1, issueId: 1 }),
    ]);
    // Il dialogo ha consumato la sua voce di cronologia: siamo ancora sulla scheda.
    await expect(page).toHaveURL(/\/reports\/40$/);

    // Eliminazione dalla scheda: conferma scrivendo ELIMINA, poi si torna alla lista di prima.
    await page.getByRole("button", { name: "Elimina report" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Elimina report" });
    const confirmButton = deleteDialog.getByRole("button", { name: "Elimina", exact: true });
    await expect(confirmButton).toBeDisabled();
    await deleteDialog.getByLabel("Digita ELIMINA per confermare").fill("ELIMINA");
    await confirmButton.click();

    await expect(page).toHaveURL(listUrl);
    await expect(page.getByText("Report eliminato con successo")).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Cerca report..." })).toHaveValue("rossi");
    await expect(page.getByRole("link", { name: "Apri report 39" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Apri report 40" })).toHaveCount(0);
    // Il 41 scivola dalla terza pagina alla seconda.
    await expect(page.getByRole("link", { name: "Apri report 41" })).toBeVisible();
    expect(api.calls("DELETE /api/reports/40")).toHaveLength(1);
    expect(backend.reports.some((report) => report.id === 40)).toBe(false);
    expect(api.unhandled).toEqual([]);
});

test.describe("su telefono", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("il dialogo del cliente nuovo sta nello schermo, e Indietro chiude i dialoghi senza cambiare pagina", async ({
        page,
    }) => {
        const backend = reportsBackend(seedReports());
        const api = await mockApi(page, { handlers: backend.handlers });

        await page.goto("/reports");
        await page.getByRole("button", { name: "Crea nuovo report" }).click();
        const reportDialog = page.getByRole("dialog", { name: "Nuovo report" });
        await expect(reportDialog).toBeVisible();

        await reportDialog.getByRole("button", { name: "Crea nuovo cliente" }).click();
        const customerDialog = page.getByRole("dialog", { name: "Nuovo cliente" });
        await expect(customerDialog).toBeVisible();

        // Titolo e "Salva" interi dentro lo schermo, e il dialogo non esce dai lati.
        await expect(customerDialog.getByRole("heading", { name: "Nuovo cliente" })).toBeInViewport({ ratio: 1 });
        await expect(customerDialog.getByRole("button", { name: "Salva" })).toBeInViewport({ ratio: 1 });
        const box = await customerDialog.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(390);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

        // Indietro chiude il dialogo in primo piano, e solo lui.
        await page.goBack();
        await expect(customerDialog).toBeHidden();
        await expect(reportDialog).toBeVisible();
        await expect(page).toHaveURL(/\/reports$/);

        // Ancora Indietro: si chiude anche il report, e si resta sulla lista.
        await page.goBack();
        await expect(reportDialog).toBeHidden();
        await expect(page).toHaveURL(/\/reports$/);
        await expect(page.getByRole("heading", { name: "Report", exact: true })).toBeVisible();
        expect(api.calls("POST /api/customers")).toEqual([]);
        expect(api.unhandled).toEqual([]);
    });
});
