import type { ComponentProps } from "react";
import LoadingPage from "@/components/loadingPage";
import NotFoundState from "@/components/not-found-state";

type EntityDetailGateProps = {
    isNotFound: boolean;
    isLoading: boolean;
    /** Titolo, spiegazione e strada d'uscita della scheda che non esiste. */
    notFound: ComponentProps<typeof NotFoundState>;
    /**
     * Il testo da mostrare se, finito il caricamento, i dati non ci sono (es. "Report non
     * disponibile."). Solo le schede che senza dati non hanno niente da disegnare: cliente,
     * collaboratore e tecnico si disegnano anche vuoti, e per loro il gate serve solo durante il
     * primo caricamento.
     */
    unavailableLabel?: string;
};

/**
 * Quello che una scheda di dettaglio mostra al posto di sé quando non può ancora mostrarsi: "non
 * trovato", il caricamento a tutta pagina o "non disponibile", in quest'ordine.
 *
 * Le cinque schede (report, intervento, cliente, collaboratore, tecnico) avevano ognuna la sua
 * copia di questi tre rami, una quindicina di righe identiche a parte i testi. La pagina decide
 * *se* cedere il posto — con un `return` anticipato, dopo tutti gli hook — e il gate *cosa*
 * mostrare: l'ordine resta uno solo. Il caricamento a tutta pagina vale solo senza dati (è la
 * pagina a non chiamare il gate quando li ha): su un ricaricamento la scheda resta, attenuata,
 * invece di lampeggiare o smontare un dialogo aperto (vedi `ReportPage`).
 */
const EntityDetailGate = ({ isNotFound, isLoading, notFound, unavailableLabel }: EntityDetailGateProps) => {
    if (isNotFound) {
        return <NotFoundState {...notFound} />;
    }

    if (isLoading || unavailableLabel == null) {
        return <LoadingPage />;
    }

    return <div className="flex h-full items-center justify-center text-muted-foreground">{unavailableLabel}</div>;
};

export default EntityDetailGate;
