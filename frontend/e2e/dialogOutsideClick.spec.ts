import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./support/mockApi";

/**
 * Il clic fuori da un `CustomDialog`. jsdom non sa simularlo (né su `CustomDialog` né su un
 * `<Dialog.Root>` Radix nudo: vedi il commento in `customDialog.test.tsx`), quindi la regola
 * di `onInteractOutside` si prova qui, con un clic vero sull'oscuramento dietro il dialogo:
 * con modifiche non salvate il dialogo NON si chiude e compare "Modifiche non salvate", senza
 * modifiche si chiude.
 *
 * Il dialogo è "Nuovo report", che passa da `CustomDialog` come tutti gli altri.
 */

/** Un punto dell'oscuramento, fuori dal dialogo (che sta al centro): l'angolo in alto a sinistra. */
const clickOutside = (page: Page) => page.mouse.click(5, 5);

const openReportDialog = async (page: Page) => {
    await mockApi(page);
    await page.goto("/reports");
    await page.getByRole("button", { name: "Crea nuovo report" }).click();

    const dialog = page.getByRole("dialog", { name: "Nuovo report" });
    await expect(dialog).toBeVisible();

    return dialog;
};

test("con modifiche non salvate il clic fuori chiede conferma e non chiude il dialogo", async ({ page }) => {
    const dialog = await openReportDialog(page);
    const passwordField = dialog.getByLabel("Password sblocco");
    await passwordField.fill("1234");

    await clickOutside(page);

    const confirm = page.getByRole("dialog", { name: "Modifiche non salvate" });
    await expect(confirm).toBeVisible();
    // Il modulo sotto è ancora lì, con quello che si era scritto.
    await expect(dialog).toBeVisible();
    await expect(passwordField).toHaveValue("1234");

    // "Continua a modificare" chiude solo la domanda: il modulo e i dati restano.
    await confirm.getByRole("button", { name: "Continua a modificare" }).click();
    await expect(confirm).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(passwordField).toHaveValue("1234");

    // Un secondo clic fuori richiede di nuovo conferma, e "Chiudi senza salvare" chiude davvero.
    await clickOutside(page);
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Chiudi senza salvare" }).click();
    await expect(confirm).toBeHidden();
    await expect(dialog).toBeHidden();
});

test("senza modifiche il clic fuori chiude il dialogo, senza chiedere niente", async ({ page }) => {
    const dialog = await openReportDialog(page);

    await clickOutside(page);

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Modifiche non salvate" })).toHaveCount(0);
});
