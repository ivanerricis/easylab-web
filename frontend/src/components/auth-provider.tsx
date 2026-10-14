import axios from "axios";
import { startTransition, useCallback, useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { getMe, login as apiLogin, logout as apiLogout, verifyTwoFactorLogin } from "@/lib/api";
import type { UserDto } from "@/lib/api";
import { setUnauthorizedHandler } from "@/lib/api/client";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api/errors";
import { AuthProviderContext } from "@/components/auth-provider-context";
import { Button } from "@/components/ui/button";

type AuthProviderProps = {
    children: React.ReactNode;
};

/**
 * La schermata di quando non si è riusciti a sapere se c'è una sessione: il server non risponde,
 * o risponde con un errore suo. Sta qui e non in una pagina perché l'`AuthProvider` avvolge
 * tutte le rotte, login compreso, e nessuna di esse ha senso finché la domanda resta aperta.
 */
const SessionCheckErrorScreen = ({
    message,
    isRetrying,
    onRetry,
}: {
    message: string;
    isRetrying: boolean;
    onRetry: () => void;
}) => (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 text-foreground">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <WifiOff className="size-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold">Impossibile contattare il server</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button type="button" onClick={onRetry} disabled={isRetrying}>
                <RefreshCw className={isRetrying ? "animate-spin" : undefined} />
                Riprova
            </Button>
        </div>
    </main>
);

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<UserDto | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // Il messaggio dell'ultima verifica della sessione fallita per un motivo diverso da 401.
    const [sessionCheckError, setSessionCheckError] = useState<string | null>(null);
    const [isRetrying, setIsRetrying] = useState(false);

    /**
     * Solo un 401 vuol dire "non autenticato". Prima qualunque errore di `/auth/me` azzerava
     * l'utente: con la rete assente, il server in riavvio (un aggiornamento) o un 502 del tunnel,
     * chi aveva una sessione valida veniva mandato al login — dove poi non poteva comunque
     * entrare, e dopo il login perdeva la pagina che aveva aperto. Ora un errore di rete o del
     * server lascia l'utente com'è e, se non ce n'è ancora uno, mostra una schermata con
     * "Riprova" invece di un login che non serve.
     */
    const refresh = useCallback(async () => {
        try {
            const currentUser = await getMe();
            setUser(currentUser);
            setSessionCheckError(null);
        } catch (error) {
            // La schermata d'errore solo per un fallimento HTTP (nessuna risposta, o una
            // risposta che non è 401): è ciò che "rete assente o server fermo" vuol dire. Un
            // errore che non viene da axios non dice niente del server, e resta com'era.
            if (getApiErrorStatus(error) === 401 || !axios.isAxiosError(error)) {
                setUser(null);
                setSessionCheckError(null);
            } else {
                setSessionCheckError(
                    getApiErrorMessage(error, "Il server ha risposto con un errore. Riprova fra qualche istante.")
                );
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleRetry = useCallback(async () => {
        setIsRetrying(true);
        try {
            await refresh();
        } finally {
            setIsRetrying(false);
        }
    }, [refresh]);

    useEffect(() => {
        startTransition(() => {
            void refresh();
        });
    }, [refresh]);

    // Registra chi risponde a un 401 fuori da `/auth/` (sessione scaduta o revocata da
    // Sicurezza): azzerare l'utente basta, `RequireAuth` porta già al login da sé quando lo
    // vede diventare `null`. Tolto allo smontaggio, che qui capita solo negli unmount dei
    // test — in app l'`AuthProvider` vive quanto l'applicazione.
    useEffect(() => {
        setUnauthorizedHandler(() => setUser(null));
        return () => setUnauthorizedHandler(null);
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        const result = await apiLogin(username, password);

        // Solo il ramo autenticato scrive l'utente: con la 2FA attiva la sessione non
        // esiste ancora, e mettere qualcosa qui farebbe entrare `RequireAuth` prima del
        // secondo fattore.
        if (result.status === "authenticated") {
            setUser(result.user);
        }

        return result;
    }, []);

    const completeTwoFactorLogin = useCallback(async (challengeId: string, code: string) => {
        const loggedInUser = await verifyTwoFactorLogin(challengeId, code);
        setUser(loggedInUser);
        return loggedInUser;
    }, []);

    const logout = useCallback(async () => {
        try {
            await apiLogout();
        } finally {
            setUser(null);
        }
    }, []);

    const value = { user, isLoading, login, completeTwoFactorLogin, logout, refresh };

    // Con un utente già in mano (un `refresh()` successivo fallito per la rete) si resta dove si
    // è: la prossima richiesta con la sessione davvero scaduta risponde 401 e l'handler sopra
    // porta al login da sé.
    if (sessionCheckError && !user) {
        return (
            <SessionCheckErrorScreen
                message={sessionCheckError}
                isRetrying={isRetrying}
                onRetry={() => void handleRetry()}
            />
        );
    }

    return <AuthProviderContext.Provider value={value}>{children}</AuthProviderContext.Provider>;
}
