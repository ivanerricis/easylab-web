import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
        // Qui il query layer è mockato e non serve un database. I test che eseguono l'SQL
        // vero sono i `*.db.test.ts`, con la loro config: `npm run test:db`.
        exclude: ["**/node_modules/**", "src/**/*.db.test.ts"],
        globals: false,
        // Copertura: la scrive `npm run test:coverage`. `lcov` va a Codecov, `text-summary`
        // stampa il riepilogo nel log. I test e il loro supporto non contano come codice.
        coverage: {
            provider: "v8",
            reportsDirectory: "coverage",
            reporter: ["lcov", "text-summary"],
            include: ["src/**"],
            exclude: ["src/**/*.test.ts", "src/test/**", "src/**/*.d.ts"],
        },
    },
});
