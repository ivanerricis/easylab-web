import { defineConfig, devices } from "@playwright/test";

/**
 * Test nel browser vero (`npm run test:e2e`), per ciò che jsdom non sa fare: impaginare,
 * gestire mouse e doppio click con le coordinate reali, applicare le regole native dei form.
 *
 * L'API è simulata dentro il browser (`e2e/support/mockApi.ts`), quindi non servono né il
 * backend né il database. Si prova la build di produzione servita da `vite preview`, su una
 * porta sua per non scontrarsi con il dev stack sulla 5173.
 *
 * Non il server di sviluppo: a freddo Vite scopre le dipendenze dei moduli caricati in
 * differita (il calendario) solo quando servono, le ottimizza e *ricarica la pagina*, a test
 * già iniziato. Da solo il test passava, con tre in parallelo falliva. La build non ha
 * sorprese, ed è anche quello che poi gira davvero.
 */
const port = 5174;
const outDir = "dist-e2e";

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["github"], ["list"]] : "list",
    // Le pagine arrivano a pezzi (`lazy`), e il calendario solo dopo la dashboard: con tre
    // browser in parallelo sul server di anteprima i 5 secondi predefiniti non bastavano
    // sempre. Un'attesa più lunga non rallenta i test che passano, finisce appena c'è l'elemento.
    expect: { timeout: 15_000 },
    use: {
        baseURL: `http://localhost:${port}`,
        locale: "it-IT",
        timezoneId: "Europe/Rome",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                // In CI il Chromium scaricato da `npx playwright install`; in locale il browser
                // già installato, senza scaricarne uno: Edge su Windows, che è Chromium anche lui.
                // `PLAYWRIGHT_CHANNEL` sceglie un altro canale (per esempio "chrome").
                channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.env.CI ? undefined : "msedge"),
            },
        },
    ],
    webServer: {
        // Una cartella a parte: `dist/` resta quella della build normale.
        command: `npx vite build --outDir ${outDir} && npx vite preview --outDir ${outDir} --port ${port} --strictPort`,
        url: `http://localhost:${port}`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        // Stessa origin del server di prova: ogni chiamata passa da `page.route`, e una
        // rotta dimenticata non finisce per sbaglio sul backend del dev stack. Passate da qui e
        // non dalla shell: Git Bash riscriverebbe "/api" in "C:/Program Files/Git/api".
        env: { VITE_API_URL: "/api", VITE_LOGO_URL: "/assets/logo.jpg" },
    },
});
