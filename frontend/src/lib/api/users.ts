import { api } from "./client";
import type { UserDto } from "./auth";

export const listUsers = async () => (await api.get<UserDto[]>("/users")).data;

export type CreatedUserResult = {
    user: UserDto;
    generatedPassword: string;
};

export const createUser = async (username: string) => (await api.post<CreatedUserResult>("/users", { username })).data;

export const regeneratePassword = async (userId: number) =>
    (await api.post<CreatedUserResult>(`/users/${userId}/regenerate-password`)).data;

export const disableUser = async (userId: number) => (await api.post<UserDto>(`/users/${userId}/disable`)).data;

export const enableUser = async (userId: number) => (await api.post<UserDto>(`/users/${userId}/enable`)).data;

/**
 * Sblocco da amministratore per il telefono perso: toglie il secondo fattore, non lo mostra.
 * `password` serve solo sul proprio account, dove il backend la pretende.
 */
export const disableUserTwoFactor = async (userId: number, password?: string) =>
    (await api.post<UserDto>(`/users/${userId}/disable-2fa`, password ? { password } : undefined)).data;

export const deleteUser = async (userId: number) => {
    await api.delete(`/users/${userId}`);
};

export type SessionDto = {
    id: string;
    createdAt: string;
    expiresAt: string;
    /** Ultima richiesta fatta con questa sessione: distingue quelle vive dalle abbandonate. */
    lastSeenAt: string;
    /** "Chrome su Windows": lo ricava il server dallo User-Agent del login, `null` se non basta. */
    device: string | null;
    isCurrent: boolean;
};

export const listUserSessions = async (userId: number) =>
    (await api.get<SessionDto[]>(`/users/${userId}/sessions`)).data;

export const revokeUserSession = async (userId: number, sessionId: string) => {
    await api.delete(`/users/${userId}/sessions/${encodeURIComponent(sessionId)}`);
};
