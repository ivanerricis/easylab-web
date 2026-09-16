import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * "Torna indietro" delle schede: la pagina precedente, se ce n'è una in questa applicazione;
 * altrimenti l'elenco da cui la scheda di solito si apre.
 *
 * Prima era un `navigate(-1)` e basta. Da quando "Apri" è un link, una scheda si può aprire
 * in un'altra scheda del browser (Ctrl+clic), o arrivarci da un link incollato: lì non c'è
 * una pagina precedente, e la freccia non faceva niente — o peggio portava fuori dall'app.
 * React Router dà `key === "default"` proprio alla prima voce della cronologia che gestisce.
 */
export const useGoBack = (fallbackPath: string) => {
    const navigate = useNavigate();
    const { key } = useLocation();

    return useCallback(() => {
        if (key === "default") {
            navigate(fallbackPath, { replace: true });
            return;
        }

        navigate(-1);
    }, [fallbackPath, key, navigate]);
};
