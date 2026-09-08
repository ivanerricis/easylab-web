import { startTransition, useCallback, useEffect, useState } from "react";
import { getMe, login as apiLogin, logout as apiLogout, verifyTwoFactorLogin } from "@/lib/api";
import type { UserDto } from "@/lib/api";
import { AuthProviderContext } from "@/components/auth-provider-context";

type AuthProviderProps = {
    children: React.ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<UserDto | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const currentUser = await getMe();
            setUser(currentUser);
        } catch {
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        startTransition(() => {
            void refresh();
        });
    }, [refresh]);

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

    return <AuthProviderContext.Provider value={value}>{children}</AuthProviderContext.Provider>;
}
