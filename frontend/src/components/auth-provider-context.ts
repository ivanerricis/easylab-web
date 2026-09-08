import { createContext } from "react";
import type { LoginResult, UserDto } from "@/lib/api";

export type AuthProviderState = {
    user: UserDto | null;
    isLoading: boolean;
    /**
     * Con la 2FA attiva non restituisce un utente ma un challenge: la sessione nasce solo
     * dopo `completeTwoFactorLogin`. Il challenge resta alla pagina di login, che è l'unica
     * a cui serve — qui dentro sarebbe uno stato di autenticazione a metà, visibile a tutta
     * l'app, che non corrisponde a nessuna sessione reale.
     */
    login: (username: string, password: string) => Promise<LoginResult>;
    completeTwoFactorLogin: (challengeId: string, code: string) => Promise<UserDto>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
};

export const initialAuthProviderState: AuthProviderState = {
    user: null,
    isLoading: true,
    login: async () => {
        throw new Error("AuthProvider non inizializzato");
    },
    completeTwoFactorLogin: async () => {
        throw new Error("AuthProvider non inizializzato");
    },
    logout: async () => {},
    refresh: async () => {},
};

export const AuthProviderContext = createContext<AuthProviderState>(initialAuthProviderState);
