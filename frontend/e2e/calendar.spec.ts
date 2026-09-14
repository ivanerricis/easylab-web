import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./support/mockApi";

/**
 * Il doppio click su un giorno libero del calendario apre la creazione di un intervento con
 * quella data. react-big-calendar decide il giorno dalle coordinate del mouse e dalle misure
 * delle celle, che in jsdom valgono zero: da qui il test nel browser.
 */
test.beforeEach(async ({ page }) => {
    // La vista del calendario si ricorda fra una visita e l'altra: qui parte dal mese.
    await page.addInitScript(() => localStorage.clear());
});

/**
 * Il 15 del mese corrente, come lo mostra il campo data. Niente orologio finto: con
 * `page.clock.setFixedTime` l'app restava ferma sulla schermata di caricamento.
 */
const fifteenthOfThisMonth = () => {
    const now = new Date();
    return `15/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
};

/**
 * Il calendario è l'ultimo pezzo della dashboard ad arrivare (chunk `lazy` dopo quello della
 * pagina): al primo avvio a freddo, con tre browser in parallelo, ha superato anche i 15
 * secondi dell'attesa generale. Qui l'attesa è più lunga, e finisce appena c'è.
 */
const openMonthCalendar = async (page: Page) => {
    await page.goto("/dashboard");
    await expect(page.locator(".rbc-month-view")).toBeVisible({ timeout: 30_000 });
};

/** Un punto dentro la cella del giorno, sotto il numero: cliccare il numero apre la vista giorno. */
const dayCellPoint = async (page: Page, day: string) => {
    const dateCell = page.locator(".rbc-month-view .rbc-date-cell:not(.rbc-off-range)").filter({
        has: page.getByRole("button", { name: day, exact: true }),
    });
    const box = await dateCell.boundingBox();

    if (!box) {
        throw new Error(`Cella del giorno ${day} non trovata`);
    }

    return { x: box.x + box.width / 2, y: box.y + box.height + 25 };
};

test("il doppio click su un giorno apre il nuovo intervento con quella data", async ({ page }) => {
    const api = await mockApi(page);

    await openMonthCalendar(page);

    const point = await dayCellPoint(page, "15");
    await page.mouse.dblclick(point.x, point.y);

    const dialog = page.getByRole("dialog", { name: "Nuovo intervento" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#interventionDate")).toContainText(fifteenthOfThisMonth());
    expect(api.unhandled).toEqual([]);
});

/** Il click singolo serve a selezionare trascinando: non deve aprire niente. */
test("un click singolo su un giorno non apre la creazione", async ({ page }) => {
    const api = await mockApi(page);

    await openMonthCalendar(page);

    const point = await dayCellPoint(page, "15");
    await page.mouse.click(point.x, point.y);

    // Il tempo di un eventuale secondo click, poi si controlla che nessun dialogo sia comparso.
    await page.waitForTimeout(500);
    await expect(page.getByRole("dialog", { name: "Nuovo intervento" })).toHaveCount(0);
    expect(api.unhandled).toEqual([]);
});
