import { createContext } from "react";

export type Theme = "dark" | "light" | "system";

export type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const initialThemeProviderState: ThemeProviderState = {
    theme: "system",
    setTheme: () => null,
};

export const ThemeProviderContext = createContext<ThemeProviderState>(initialThemeProviderState);
