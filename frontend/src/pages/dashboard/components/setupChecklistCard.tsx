import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/use-auth";
import { dismissSetupChecklist, getSetupChecklist, type SetupChecklistDto, type SetupStepKey } from "@/lib/api";

const stepTexts: Record<SetupStepKey, { title: string; description: string }> = {
    company: { title: "Dati del laboratorio", description: "Nome, indirizzo, contatti e logo su app e PDF." },
    email: { title: "Invio email", description: "Il server SMTP con cui spedire preventivi e promemoria." },
    backup: { title: "Backup automatico", description: "Una copia periodica dei dati, anche su un NAS." },
};

/**
 * La guida dopo una nuova installazione: password e verifica in due passaggi sono già obbligatorie
 * al primo accesso, restano le impostazioni che nessuno controlla finché non servono. Ogni voce
 * porta alla sezione giusta e si spunta da sola quando è configurata, quindi sparisce senza che
 * nessuno debba ricordarsi di chiuderla; chi non la vuole la chiude con il pulsante.
 *
 * Solo per l'amministratore (le impostazioni sono sue) e in silenzio se il caricamento fallisce:
 * è un aiuto, non deve sporcare la dashboard con un errore.
 */
const SetupChecklistCard = () => {
    const { user } = useAuth();
    const isAdmin = Boolean(user?.isAdmin);
    const [checklist, setChecklist] = useState<SetupChecklistDto | null>(null);

    useEffect(() => {
        if (!isAdmin) {
            return;
        }

        let cancelled = false;
        getSetupChecklist()
            .then((result) => {
                if (!cancelled) {
                    setChecklist(result);
                }
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [isAdmin]);

    const handleDismiss = useCallback(async () => {
        setChecklist((current) => (current ? { ...current, dismissed: true } : current));
        await dismissSetupChecklist().catch(() => {});
    }, []);

    if (!isAdmin || !checklist || checklist.dismissed || checklist.steps.every((step) => step.done)) {
        return null;
    }

    const doneCount = checklist.steps.filter((step) => step.done).length;

    return (
        <Card data-testid="setup-checklist" className="shrink-0 gap-3 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="text-base font-semibold">Primi passi</h2>
                    <p className="text-sm text-muted-foreground">
                        {doneCount} di {checklist.steps.length} completati. Configura il resto quando vuoi.
                    </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => void handleDismiss()}>
                    Chiudi guida
                </Button>
            </div>
            <ul className="grid gap-2 sm:grid-cols-3">
                {checklist.steps.map((step) => {
                    const Icon = step.done ? Check : Circle;

                    return (
                        <li key={step.key}>
                            <Link
                                to={`/settings?section=${step.key}`}
                                className="flex h-full items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                            >
                                <Icon
                                    aria-hidden="true"
                                    className={
                                        step.done
                                            ? "mt-0.5 size-4 text-primary-text"
                                            : "mt-0.5 size-4 text-muted-foreground"
                                    }
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium">
                                        {stepTexts[step.key].title}
                                        <span className="sr-only">{step.done ? " (fatto)" : " (da fare)"}</span>
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        {stepTexts[step.key].description}
                                    </span>
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </Card>
    );
};

export default SetupChecklistCard;
