import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
    globalIgnores(["dist", "node_modules", "drizzle", "coverage", "coverage-db"]),
    {
        files: ["**/*.ts"],
        extends: [js.configs.recommended, tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: globals.node,
        },
        rules: {
            // Le firme dei middleware Express usano parametri posizionali che non
            // sempre servono (`_req`, `_next`): consentiti se prefissati con `_`.
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
            ],
        },
    },
    {
        // Gli shim ambient per librerie non tipizzate (pdfmake) usano `any` per
        // strutture troppo libere da descrivere: non è un difetto da correggere.
        files: ["**/*.d.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
]);
