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
    },
});
