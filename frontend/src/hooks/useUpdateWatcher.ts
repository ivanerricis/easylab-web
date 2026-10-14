import { useEffect, useRef } from "react";
import { useBusyGuard } from "@/components/use-busy-guard";
import { getUpdateState } from "@/lib/api";
import { updatePhaseSteps } from "@/lib/updatePhases";

const POLL_INTERVAL_MS = 5000;

/**
 * L'aggiornamento parte da un browser solo ma ricostruisce i container per tutti: senza
 * questa sorveglianza le altre postazioni continuavano a lavorare mentre il backend stava
 * per sparire — scrivendo mentre girano le migrazioni — e a fine aggiornamento restavano con
 * il bundle vecchio in pagina. Ogni scheda autenticata interroga quindi lo stato per conto
 * suo, mostra lo stesso blocco a schermo e ricarica quando l'aggiornamento è riuscito.
 */
export const useUpdateWatcher = () => {
    const { setBusy } = useBusyGuard();
    const wasUpdatingRef = useRef(false);

    useEffect(() => {
        let cancelled = false;

        const poll = async () => {
            let state;
            let phase;

            try {
                ({ state, phase } = await getUpdateState());
            } catch {
                // Mentre i container si ricostruiscono il backend non risponde: un errore di
                // rete non è la fine dell'aggiornamento, quindi il blocco resta dov'è.
                return;
            }

            if (cancelled) {
                return;
            }

            if (state === "running") {
                wasUpdatingRef.current = true;
                // Riasserito a ogni giro di proposito: se qualcun altro toglie il blocco
                // (il pannello Impostazioni lo fa quando rinuncia ad aspettare) torna su.
                // Le fasi arrivano dallo stato del server, così anche le schede che non hanno
                // lanciato l'aggiornamento mostrano a che punto è. Se il server non ne
                // dichiara una (ancora o già) si tiene quella che c'è: sulla scheda che ha
                // lanciato l'aggiornamento è il pannello a tenerla, e a fine corsa a metterla
                // "oltre l'ultima".
                setBusy((prev) => ({
                    title: "Aggiornamento in corso...",
                    description:
                        "Non chiudere o ricaricare la pagina: l'applicazione si ricaricherà automaticamente al termine.",
                    steps: updatePhaseSteps,
                    activeStepKey: phase ?? prev?.activeStepKey ?? updatePhaseSteps[0].key,
                }));
                return;
            }

            if (!wasUpdatingRef.current) {
                return;
            }

            wasUpdatingRef.current = false;
            setBusy(null);

            // Se l'aggiornamento è fallito non c'è niente di nuovo da caricare e ricaricare
            // qui butterebbe via l'errore mostrato a chi l'ha lanciato.
            if (state === "success") {
                window.location.reload();
            }
        };

        void poll();
        const intervalId = window.setInterval(() => void poll(), POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [setBusy]);
};
