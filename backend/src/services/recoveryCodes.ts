import crypto from "node:crypto";
import { randomIndex } from "./passwordPolicy";

/**
 * Codici di recupero monouso: la via d'uscita quando il telefono con l'app di
 * autenticazione è perso, rubato o semplicemente altrove.
 *
 * Senza di essi la 2FA sarebbe soprattutto un nuovo modo di restare chiusi fuori, ed è il
 * motivo per cui questo modulo va scritto insieme al secondo fattore e non dopo.
 *
 * Come `totp.ts` e `passwordPolicy.ts` non tocca il database: genera, normalizza e calcola
 * l'hash. Il consumo — che deve essere atomico — sta in `db/queries/recoveryCode.ts`.
 */

export const recoveryCodeCount = 8;

// Due gruppi da quattro: la lunghezza a cui un codice si ricopia da un foglio senza perdere
// il segno. Alfabeto senza caratteri ambigui, lo stesso ragionamento delle password generate.
const groupLength = 4;
const groupCount = 2;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 32^8 combinazioni, cioè 40 bit: fuori portata per chi tira a indovinare cinque volte. */
const generateOne = (): string => {
    const groups: string[] = [];

    for (let group = 0; group < groupCount; group += 1) {
        let characters = "";

        for (let index = 0; index < groupLength; index += 1) {
            characters += alphabet[randomIndex(alphabet.length)];
        }

        groups.push(characters);
    }

    return groups.join("-");
};

export const generateRecoveryCodes = (count = recoveryCodeCount): string[] =>
    Array.from({ length: count }, generateOne);

/**
 * Il codice arriva come l'utente l'ha ricopiato: minuscolo, con o senza trattino, magari con
 * uno spazio in mezzo. Confrontare l'hash della stringa grezza rifiuterebbe codici giusti.
 */
export const normalizeRecoveryCode = (code: string): string => code.replace(/[\s-]/g, "").toUpperCase();

/**
 * In tabella finisce solo lo sha256, come per i token di sessione e per la stessa ragione:
 * sono 40 bit già casuali, non una password scelta da una persona, quindi non c'è nulla da
 * indovinare a forza bruta e non serve il costo di calcolo di scrypt. Chi legge il database
 * — per esempio da un archivio di backup — non ottiene codici riutilizzabili.
 */
export const hashRecoveryCode = (code: string): string =>
    crypto.createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");

/** Un codice plausibile: la forma giusta prima ancora di cercarlo nel database. */
export const looksLikeRecoveryCode = (code: string): boolean =>
    new RegExp(`^[${alphabet}]{${groupLength * groupCount}}$`).test(normalizeRecoveryCode(code));
