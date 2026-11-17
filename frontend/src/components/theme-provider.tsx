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
        const media = window.matchMedia("(prefers-color-scheme: dark)");

        // Una funzione sola per applicare il tema, richiamabile anche quando cambia il sistema.
        const applyTheme = () => {
            root.classList.remove("light", "dark");
            root.classList.add(theme === "system" ? (media.matches ? "dark" : "light") : theme);
        };

        applyTheme();

        applyPreference("accent", getStoredPreference("accent"));
        applyPreference("rowIntensity", getStoredPreference("rowIntensity"));
        applyPreference("density", getStoredPreference("density"));
        applyPreference("fontSize", getStoredPreference("fontSize"));
        applyPreference("radius", getStoredPreference("radius"));

        // Con "system" il tema segue il sistema operativo anche a pagina aperta (tramonto,
        // tema automatico di Windows/macOS): prima si leggeva una volta sola al montaggio.
        if (theme !== "system") {
            return;
        }

        media.addEventListener("change", applyTheme);

        return () => media.removeEventListener("change", applyTheme);
    }, [theme]);

    useEffect(() => {
        // L'evento `storage` parte solo nelle *altre* schede: la scelta fatta in una si propaga
        // alle altre, che altrimenti restavano sul tema vecchio fino al ricaricamento. `key`
        // è null quando lo storage viene svuotato: si torna al tema predefinito.
        const onStorage = (event: StorageEvent) => {
            if (event.key !== null && event.key !== storageKey) {
                return;
            }

            setTheme((event.newValue as Theme) || defaultTheme);
        };

        window.addEventListener("storage", onStorage);

        return () => window.removeEventListener("storage", onStorage);
    }, [storageKey, defaultTheme]);

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
