import { api } from "./client";

/**
 * Gestione del *proprio* secondo fattore. Il login a due passi sta invece in `auth.ts`,
 * perché avviene senza sessione ed è l'unica parte che il resto dell'app non può chiamare.
 */

export type TwoFactorStatusDto = {
    enabled: boolean;
    remainingRecoveryCodes: number;
};

export type TwoFactorSetupDto = {
    /** Da mostrare accanto al QR, per chi inserisce il segreto a mano. */
    secretBase32: string;
    otpauthUri: string;
    /** PNG già pronto come data URL: il segreto non passa mai per un URL. */
    qrDataUrl: string;
};

export type RecoveryCodesDto = {
    recoveryCodes: string[];
};

export const getTwoFactorStatus = async () => (await api.get<TwoFactorStatusDto>("/auth/2fa")).data;

export const startTwoFactorSetup = async (password: string) =>
    (await api.post<TwoFactorSetupDto>("/auth/2fa/setup", { password })).data;

/** Restituisce i codici di recupero: è l'unica volta che il server li manda in chiaro. */
export const enableTwoFactor = async (code: string) =>
    (await api.post<RecoveryCodesDto>("/auth/2fa/enable", { code })).data;

export type TwoFactorConfirmInput = {
    password: string;
    code: string;
};

export const disableTwoFactor = async (payload: TwoFactorConfirmInput) => {
    await api.delete("/auth/2fa", { data: payload });
};

export const regenerateRecoveryCodes = async (payload: TwoFactorConfirmInput) =>
    (await api.post<RecoveryCodesDto>("/auth/2fa/recovery-codes", payload)).data;
