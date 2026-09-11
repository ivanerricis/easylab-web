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
