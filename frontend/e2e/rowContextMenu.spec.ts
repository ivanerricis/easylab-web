import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

/**
 * Il menu col tasto destro sulle righe della tabella, nel browser vero: si apre sulla riga, con
 * "Apri" per primo e "Elimina" in fondo, e una voce apre lo stesso dialogo del pulsante di riga.
 * Se `ROW_MENU_SHOTS` è impostata, salva anche due schermate (tema chiaro e scuro) in quella cartella.
 */

const devices = [{ id: 1, name: "iPhone 13", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null }];
const issues = [{ id: 1, description: "Batteria", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null }];

const listRow = (id: number) => ({
    id,
    customerId: 100 + id,
    customer: `Mario Rossi ${id}`,
    customerPhone: "333 0000000",
    deviceId: 1,
    issueId: 1,
    password: null,
    note: null,
    charger: false,
    dataBackup: false,
    closed: id % 2 === 0,
    collaboratorId: null,
    issueDescription: null,
    serviceDescription: null,
    alerted: false,
    pickedUp: false,
    paymentMethod: "non_paid",
    price: 0,
    device: "iPhone 13",
    issue: "Batteria",
    collaborator: "",
    technicianName: null,
    technicianPrice: 0,
    totalPrice: 0,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: null,
});

for (const theme of ["light", "dark"] as const) {
    test(`menu col tasto destro su una riga dei report (${theme})`, async ({ page }) => {
        await page.addInitScript((value) => localStorage.setItem("vite-ui-theme", value), theme);
        await mockApi(page, {
            handlers: {
                "GET /api/reports": () => ({
                    items: [1, 2, 3].map(listRow),
                    totalItems: 3,
                    page: 1,
                    pageSize: 10,
                    totalPages: 1,
                }),
                "GET /api/devices": () => devices,
                "GET /api/issues": () => issues,
            },
        });

        await page.goto("/reports");
        const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "1", exact: true }) });
        await row.getByRole("cell", { name: "1", exact: true }).click({ button: "right" });

        const items = page.getByRole("menuitem");
        await expect(items).toHaveText(["Apri", "Modifica", "Stampa", "Elimina"]);

        const shotsDir = process.env.ROW_MENU_SHOTS;
        if (shotsDir) {
            await page.screenshot({ path: `${shotsDir}/row-context-menu-${theme}.png` });
        }

        await page.getByRole("menuitem", { name: "Elimina" }).click();
        await expect(page.getByRole("dialog", { name: "Elimina report" })).toBeVisible();
    });
}
