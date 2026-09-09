import { useEffect } from "react";

/** Il nome che sta in index.html: le pagine lo aggiungono in coda al proprio titolo. */
const appName = "EasyLab";

/**
 * Scrive il titolo della finestra.
 *
 * Serve perché questo è un gestionale che si usa con più schede aperte insieme — report,
 * interventi, la scheda di un cliente — e finora erano tutte intitolate "EasyLab", quindi
 * indistinguibili nella barra delle schede e nella cronologia.
 *
 * Il titolo precedente viene ripristinato allo smontaggio: così una pagina che si chiude
 * non lascia il proprio nome addosso a quella che le succede.
 */
export const useDocumentTitle = (title: string | undefined) => {
    useEffect(() => {
        const previousTitle = document.title;

        document.title = title ? `${title} · ${appName}` : appName;

        return () => {
            document.title = previousTitle;
        };
    }, [title]);
};
