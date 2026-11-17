// Applica la classe del tema a <html> prima del primo paint, così non c'è il lampo bianco in
// attesa che React monti il ThemeProvider. Deve restare allineato a theme-provider.tsx: stessa
// chiave ("vite-ui-theme") e stessi valori ("light" | "dark" | "system").
(function () {
    var theme = null;

    try {
        // Con i dati del sito bloccati localStorage lancia: si ricade sul tema del sistema.
        theme = localStorage.getItem("vite-ui-theme");
    } catch (error) {
        theme = null;
    }

    if (theme !== "light" && theme !== "dark") {
        theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    document.documentElement.classList.add(theme);
})();
