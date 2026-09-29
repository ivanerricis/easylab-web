import { expect, test } from "@playwright/test";
import { mockApi, type ApiHandler } from "./support/mockApi";

/**
 * I dialoghi di creazione a passi (telefono, sotto 640px), con la ricerca clienti vera nel
 * browser vero. I test in jsdom (`reportDialogs.test.tsx`, `interventionDialogs.test.tsx`)
 * coprono il passaggio fra i passi con il cliente scritto a mano: su CI il suggerimento del
 * cliente non compariva in quei test, e la causa non è chiarita (vedi `docs/BACKLOG.md`). Qui
 * si prova che sul telefono la lista compare, si sceglie, e "Avanti" prosegue senza cercare di
 * nuovo il cliente sul server.
 */

const timestamps = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null };

const customers = [
    { id: 30, firstName: "Mario", lastName: "Rossi", phoneNumber: "333 1234567", ...timestamps },
    { id: 31, firstName: "Anna", lastName: "Bianchi", phoneNumber: "347 7654321", ...timestamps },
].map((customer) => ({ phoneNumberSecondary: null, email: null, city: null, ...customer }));

const devices = [{ id: 1, name: "iPhone 13", ...timestamps }];
const issues = [{ id: 1, description: "Batteria", ...timestamps }];
const collaborators = [{ id: 40, firstName: "Luca", lastName: "Bianchi", phoneNumber: null, ...timestamps }];

/** Cerca per nome o cognome, come il server: una risposta paginata sempre. */
const searchCustomers: ApiHandler = ({ url }) => {
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const items = customers.filter((customer) =>
        `${customer.firstName} ${customer.lastName}`.toLowerCase().includes(search)
    );

    return { items, totalItems: items.length, page: 1, pageSize: 8, totalPages: 1 };
};

test.describe("su telefono", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("nuovo report: il suggerimento del cliente compare, si sceglie e si passa al passo dopo", async ({ page }) => {
        const api = await mockApi(page, {
            handlers: {
                "GET /api/customers": searchCustomers,
                "GET /api/devices": () => devices,
                "GET /api/issues": () => issues,
            },
        });

        await page.goto("/reports");
        await page.getByRole("button", { name: "Crea nuovo report" }).click();
        const dialog = page.getByRole("dialog", { name: "Nuovo report" });
        await expect(dialog.getByText("Passo 1 di 3:")).toBeVisible();

        // Si scrive solo un pezzo del nome: la lista compare dopo la pausa di battitura.
        const customerField = dialog.getByRole("combobox", { name: /Cliente/ });
        await customerField.fill("ros");
        await dialog.getByRole("option", { name: "Mario Rossi - 333 1234567" }).click();
        await expect(customerField).toHaveValue("Mario Rossi - 333 1234567");

        const deviceField = dialog.getByRole("combobox", { name: /Tipologia dispositivo/ });
        await deviceField.fill("iph");
        await dialog.getByRole("option", { name: "iPhone 13" }).click();

        await dialog.getByRole("button", { name: "Avanti" }).click();

        await expect(dialog.getByText("Passo 2 di 3:")).toBeVisible();
        await expect(dialog.getByRole("combobox", { name: /Difetto/ })).toBeVisible();
        // Il cliente veniva da un suggerimento, quindi "Avanti" non lo ha cercato di nuovo
        // (la verifica chiede fino a 1000 candidati, la ricerca dei suggerimenti 8): l'unica
        // richiesta è quella dei suggerimenti.
        expect(api.calls("GET /api/customers")).toHaveLength(1);
        expect(api.unhandled).toEqual([]);
    });

    test("nuovo intervento: il suggerimento del cliente compare, si sceglie e si passa al passo dopo", async ({
        page,
    }) => {
        const api = await mockApi(page, {
            handlers: {
                "GET /api/customers": searchCustomers,
                "GET /api/collaborators": () => collaborators,
            },
        });

        await page.goto("/interventions");
        await page.getByRole("button", { name: "Crea nuovo intervento" }).click();
        const dialog = page.getByRole("dialog", { name: "Nuovo intervento" });
        await expect(dialog.getByText("Passo 1 di 4:")).toBeVisible();

        const customerField = dialog.getByRole("combobox", { name: /Cliente/ });
        await customerField.fill("bianc");
        await dialog.getByRole("option", { name: "Anna Bianchi - 347 7654321" }).click();
        await expect(customerField).toHaveValue("Anna Bianchi - 347 7654321");

        await dialog.getByRole("combobox", { name: /Collaboratore/ }).click();
        await page.getByRole("option", { name: "Luca Bianchi" }).click();

        await dialog.getByRole("button", { name: "Avanti" }).click();

        await expect(dialog.getByText("Passo 2 di 4:")).toBeVisible();
        await expect(dialog.getByRole("combobox", { name: "Tipo intervento" })).toBeVisible();
        expect(api.calls("GET /api/customers")).toHaveLength(1);
        expect(api.unhandled).toEqual([]);
    });
});
