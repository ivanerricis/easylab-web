import { expect, test } from "@playwright/test";
import { ApiResponse, mockApi, user } from "./support/mockApi";

test.describe("accesso", () => {
    test("senza sessione porta al login, e dopo l'accesso torna alla pagina chiesta", async ({ page }) => {
        let loggedIn = false;
        const api = await mockApi(page, {
            handlers: {
                "GET /api/auth/me": () =>
                    loggedIn ? user : new ApiResponse(401, { message: "Autenticazione richiesta" }),
                "POST /api/auth/login": () => {
                    loggedIn = true;
                    return user;
                },
            },
        });

        await page.goto("/reports");
        await expect(page).toHaveURL(/\/login$/);

        await page.getByLabel("Nome utente").fill("mario");
        await page.locator("#loginPassword").fill("segreta1!");
        await page.getByRole("button", { name: "Accedi" }).click();

        await expect(page).toHaveURL(/\/reports$/);
        expect(api.calls("POST /api/auth/login")).toEqual([{ username: "mario", password: "segreta1!" }]);
        expect(api.unhandled).toEqual([]);
    });

    test("con credenziali sbagliate resta sul login e mostra il messaggio del server", async ({ page }) => {
        const api = await mockApi(page, {
            loggedIn: false,
            handlers: {
                "POST /api/auth/login": () => new ApiResponse(401, { message: "Nome utente o password non validi" }),
            },
        });

        await page.goto("/login");
        await page.getByLabel("Nome utente").fill("mario");
        await page.locator("#loginPassword").fill("sbagliata");
        await page.getByRole("button", { name: "Accedi" }).click();

        await expect(page.getByText("Nome utente o password non validi")).toBeVisible();
        await expect(page).toHaveURL(/\/login$/);
        expect(api.unhandled).toEqual([]);
    });

    test("con la 2FA attiva chiede il codice prima di entrare", async ({ page }) => {
        let loggedIn = false;
        const api = await mockApi(page, {
            handlers: {
                "GET /api/auth/me": () =>
                    loggedIn ? user : new ApiResponse(401, { message: "Autenticazione richiesta" }),
                "POST /api/auth/login": () => ({ twoFactorRequired: true, challengeId: "sfida-1" }),
                "POST /api/auth/login/2fa": () => {
                    loggedIn = true;
                    return { ...user, twoFactorEnabled: true };
                },
            },
        });

        await page.goto("/login");
        await page.getByLabel("Nome utente").fill("mario");
        await page.locator("#loginPassword").fill("segreta1!");
        await page.getByRole("button", { name: "Accedi" }).click();

        await expect(page.getByText("Verifica in due passaggi")).toBeVisible();
        // Il secondo passo non ha ancora aperto nessuna pagina dell'app.
        await expect(page).toHaveURL(/\/login$/);

        await page.locator("#loginCode").fill("123456");
        await page.getByRole("button", { name: "Verifica" }).click();

        await expect(page).toHaveURL(/\/dashboard$/);
        expect(api.calls("POST /api/auth/login/2fa")).toEqual([{ challengeId: "sfida-1", code: "123456" }]);
        expect(api.unhandled).toEqual([]);
    });
});
