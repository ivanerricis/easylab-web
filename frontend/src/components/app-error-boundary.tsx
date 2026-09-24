import React from "react";
import type { ErrorInfo, ReactNode } from "react";
import UnhandledErrorPage from "@/pages/UnhandledErrorPage";

type AppErrorBoundaryProps = {
    children: ReactNode;
};

type AppErrorBoundaryState = {
    hasError: boolean;
    /** Il crash viene dal caricamento fallito del file di una pagina: vedi `isChunkLoadError`. */
    isChunkLoadError: boolean;
};

/**
 * Il file di una rotta `lazy` non si è caricato: il caso tipico è la scheda rimasta aperta su una
 * versione vecchia mentre il server è stato aggiornato, e i file con i nomi di prima non ci sono
 * più. I messaggi sono quelli dei browser (Chromium, Firefox, Safari) e di Vite.
 */
const isChunkLoadError = (error: unknown) =>
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|preload/i.test(
        error.message
    );

class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
    public state: AppErrorBoundaryState = {
        hasError: false,
        isChunkLoadError: false,
    };

    public static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
        return { hasError: true, isChunkLoadError: isChunkLoadError(error) };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Unhandled application error", error, errorInfo);
    }

    private resetError = () => {
        this.setState({ hasError: false, isChunkLoadError: false });
    };

    public render() {
        if (this.state.hasError) {
            // Con un file di pagina non caricato, azzerare lo stato non basta: React tiene in
            // memoria il caricamento fallito della rotta `lazy` e ridisegnando si ricadeva sullo
            // stesso errore anche quando il file era tornato raggiungibile. Lì "Riprova" ricarica
            // davvero la pagina (il default di `UnhandledErrorPage`); per gli altri errori resta il
            // reset, che non fa perdere lo stato del resto dell'app.
            return <UnhandledErrorPage onRetry={this.state.isChunkLoadError ? undefined : this.resetError} />;
        }

        return this.props.children;
    }
}

export default AppErrorBoundary;
