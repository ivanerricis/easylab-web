import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
// Importato da "vitest/config" e non da "vite": è la stessa defineConfig, ma con il
// campo `test` nei tipi.
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    // usePolling: su Docker Desktop per Windows i bind mount non propagano gli eventi
    // inotify nativi nel container Linux, quindi senza polling Vite non rileva le modifiche.
    server: {
        watch: {
            usePolling: true,
        },
        // Il bind mount di Windows rende lenta la prima trasformazione di ogni file: senza
        // warmup il primo accesso dopo un riavvio del container aspettava secondi per pagina
        // (login, poi dashboard). Così Vite le prepara appena parte, prima che servano.
        warmup: {
            clientFiles: [
                "./src/main.tsx",
                "./src/pages/auth/LoginPage.tsx",
                "./src/pages/MainLayout.tsx",
                "./src/pages/dashboard/DashboardPage.tsx",
                "./src/pages/reports/ReportsPage.tsx",
                "./src/pages/interventions/InterventionsPage.tsx",
                "./src/pages/customers/CustomersPage.tsx",
            ],
        },
    },
    build: {
        assetsDir: "static",
    },
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "./src"),
        },
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        // I file di test stanno accanto al codice che coprono, come nel backend.
        include: ["src/**/*.test.{ts,tsx}"],
        // `globals` resta al default (false): describe/it/expect vanno importati da
        // "vitest". Costa una riga per file ed evita di aggiungere tipi globali ai
        // tsconfig, che sono condivisi con la build di produzione.
        restoreMocks: true,
        // Copertura: la scrive `npm run test:coverage`. `lcov` va a Codecov, `text-summary`
        // stampa il riepilogo nel log. I test e il loro supporto non contano come codice.
        coverage: {
            provider: "v8",
            reportsDirectory: "coverage",
            reporter: ["lcov", "text-summary"],
            include: ["src/**"],
            exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/**/*.d.ts", "src/**/*.css"],
        },
    },
});
