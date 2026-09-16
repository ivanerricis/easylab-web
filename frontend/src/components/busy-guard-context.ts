import { createContext } from "react";

export type BusyGuardStep = {
    key: string;
    label: string;
};

export type BusyGuardState = {
    title: string;
    description: string;
    /**
     * Passi opzionali di un'operazione a fasi (es. l'aggiornamento): se presenti, mostrati come
     * elenco sotto la descrizione con quello indicato da `activeStepKey` evidenziato e i
     * precedenti spuntati. Un'operazione senza passi noti (es. il backup) non li passa.
     *
     * `activeStepKey: null` è "oltre l'ultimo passo": spunta anche l'ultimo invece di lasciarlo
     * segnato come ancora in corso. Usarlo quando l'operazione è riuscita ma l'overlay resta
     * visibile ancora un momento (es. il conto alla rovescia prima del reload).
     */
    steps?: BusyGuardStep[];
    activeStepKey?: string | null;
};

export type BusyGuardContextValue = {
    setBusy: (state: BusyGuardState | null) => void;
};

export const BusyGuardContext = createContext<BusyGuardContextValue | null>(null);
