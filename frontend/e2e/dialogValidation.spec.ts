import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

/**
 * I dialoghi controllano i campi da sé e mostrano l'errore sotto ciascuno. Senza `noValidate`
 * sul `<form>` di `CustomDialog` il browser si metterebbe in mezzo con il suo fumetto
 * "Compila questo campo" e non invierebbe nemmeno il form: i messaggi dei dialoghi non
 * comparirebbero mai. jsdom segue la specifica ma non è un browser: questo è il controllo vero.
 */
test("salvando un report vuoto mostra gli errori sotto i campi, senza la validazione nativa", async ({ page }) => {
    const api = await mockApi(page);

    await page.goto("/reports");
    await page.getByRole("button", { name: "Crea nuovo report" }).click();

    const dialog = page.getByRole("dialog", { name: "Nuovo report" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Salva" }).click();

    await expect(dialog.getByText("Seleziona un cliente")).toBeVisible();
    await expect(dialog.getByText("Seleziona un dispositivo")).toBeVisible();
    await expect(dialog.getByText("Seleziona un difetto", { exact: true })).toBeVisible();
    // Il focus va sul primo campo sbagliato, e il dialogo resta aperto senza aver salvato.
    await expect(dialog.locator('[aria-invalid="true"]').first()).toBeFocused();
    expect(api.calls("POST /api/reports")).toEqual([]);
    expect(api.unhandled).toEqual([]);
});
