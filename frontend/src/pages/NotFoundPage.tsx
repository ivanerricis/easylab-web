import NotFoundState from "@/components/not-found-state";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * Un indirizzo che non corrisponde a nessuna pagina. Prima la rotta `*` riportava in silenzio
 * alla dashboard, e un link sbagliato sembrava funzionare.
 */
const NotFoundPage = () => {
    useDocumentTitle("Pagina non trovata");

    return (
        <NotFoundState
            title="Pagina non trovata"
            description="L'indirizzo che hai aperto non corrisponde a nessuna pagina. Potrebbe essere scritto male, o il collegamento potrebbe essere vecchio."
            backTo="/dashboard"
            backLabel="Vai alla dashboard"
        />
    );
};

export default NotFoundPage;
