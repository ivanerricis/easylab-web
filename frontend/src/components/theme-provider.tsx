import { useEffect, useState } from "react";
import { applyPreference, getStoredPreference } from "@/lib/theme";
import { safeStorage } from "@/lib/safeStorage";
import { ThemeProviderContext, type Theme } from "@/components/theme-provider-context";

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
};

export function ThemeProvider({
    children,
    defaultTheme = "system",
    storageKey = "vite-ui-theme",
    ...props
}: ThemeProviderProps) {
    // `safeStorage` e non `localStorage` diretto: questo inizializzatore gira sopra il limite
    // d'errore dell'app, e con i dati del sito bloccati il `SecurityError` di `localStorage`
    // lasciava lo schermo bianco invece del tema predefinito.
    const [theme, setTheme] = useState<Theme>(() => (safeStorage.get(storageKey) as Theme) || defaultTheme);

    useEffect(() => {
        const root = window.document.documentElement;

        root.classList.remove("light", "dark");

        if (theme === "system") {
            const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

            root.classList.add(systemTheme);
        } else {
            root.classList.add(theme);
        }

        applyPreference("accent", getStoredPreference("accent"));
        applyPreference("rowIntensity", getStoredPreference("rowIntensity"));
        applyPreference("density", getStoredPreference("density"));
        applyPreference("fontSize", getStoredPreference("fontSize"));
        applyPreference("radius", getStoredPreference("radius"));
    }, [theme]);

    const value = {
        theme,
        setTheme: (theme: Theme) => {
            safeStorage.set(storageKey, theme);
            setTheme(theme);
        },
    };

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    );
}
