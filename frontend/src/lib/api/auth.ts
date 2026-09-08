import { api } from "./client";

export type UserDto = {
    id: number;
    username: string;
    createdAt: string;
    mustChangePassword: boolean;
    active: boolean;
    isAdmin: boolean;
    twoFactorEnabled: boolean;
};

/**
 * Con la 2FA attiva il primo passo non apre nessuna sessione: risponde 200 con questo
 * corpo al posto dell'utente, e il cookie arriva solo dopo `verifyTwoFactorLogin`.
 */
export type TwoFactorChallengeDto = {
    twoFactorRequired: true;
    challengeId: string;
};

export type LoginResult =
    { status: "authenticated"; user: UserDto } | { status: "twoFactorRequired"; challengeId: string };

const isTwoFactorChallenge = (data: UserDto | TwoFactorChallengeDto): data is TwoFactorChallengeDto =>
    "twoFactorRequired" in data;

export const login = async (username: string, password: string): Promise<LoginResult> => {
    const { data } = await api.post<UserDto | TwoFactorChallengeDto>("/auth/login", { username, password });

    return isTwoFactorChallenge(data)
        ? { status: "twoFactorRequired", challengeId: data.challengeId }
        : { status: "authenticated", user: data };
};

/** Secondo passo: il codice a sei cifre dell'app, oppure un codice di recupero. */
export const verifyTwoFactorLogin = async (challengeId: string, code: string) =>
    (await api.post<UserDto>("/auth/login/2fa", { challengeId, code })).data;

export const logout = async () => {
    await api.post("/auth/logout");
};

export const getMe = async () => (await api.get<UserDto>("/auth/me")).data;

export type ChangePasswordInput = {
    currentPassword: string;
    newPassword: string;
};

export const changeOwnPassword = async (payload: ChangePasswordInput) => {
    await api.put("/auth/password", payload);
};
