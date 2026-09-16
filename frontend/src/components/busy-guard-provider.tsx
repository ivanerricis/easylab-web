import { useEffect, useState, type ReactNode } from "react";
import { Circle, CircleCheck, Loader2 } from "lucide-react";
import { BusyGuardContext, type BusyGuardState } from "@/components/busy-guard-context";
import { cn } from "@/lib/utils";

const BusySteps = ({ steps, activeStepKey }: { steps: BusyGuardState["steps"]; activeStepKey?: string | null }) => {
    if (!steps || steps.length === 0) {
        return null;
    }

    // `null` è esplicito e diverso da "nessuna chiave nota ancora arrivata" (`undefined`, o una
    // stringa che non combacia con nessuno step): significa "oltre l'ultimo passo", cioè tutto
    // fatto. Chi chiama lo usa per dire "operazione riuscita" senza dover inventare una quinta
    // fase finta solo per spuntare anche l'ultima. Vedi updateSettingsPanel.tsx.
    const activeIndex = activeStepKey === null ? steps.length : steps.findIndex((step) => step.key === activeStepKey);

    return (
        <ol className="grid w-full max-w-xs gap-1.5 text-left">
            {steps.map((step, index) => {
                const isDone = index < activeIndex;
                const isActive = index === activeIndex;
                const status = isDone ? "done" : isActive ? "active" : "pending";

                return (
                    <li
                        key={step.key}
                        aria-current={isActive ? "step" : undefined}
                        data-status={status}
                        className={cn(
                            "flex items-center gap-2 text-sm",
                            isActive ? "font-medium text-foreground" : "text-muted-foreground"
                        )}
                    >
                        {isDone ? (
                            <CircleCheck className="size-4 shrink-0 text-primary" />
                        ) : isActive ? (
                            <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                        ) : (
                            <Circle className="size-4 shrink-0" />
                        )}
                        {step.label}
                    </li>
                );
            })}
        </ol>
    );
};

export const BusyGuardProvider = ({ children }: { children: ReactNode }) => {
    const [busy, setBusy] = useState<BusyGuardState | null>(null);

    useEffect(() => {
        if (!busy) {
            return;
        }

        // Alcune operazioni (aggiornamento, ripristino database) lasciano l'app in uno
        // stato inconsistente se interrotte: evitiamo che l'utente chiuda o ricarichi la scheda.
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [busy]);

    return (
        <BusyGuardContext.Provider value={{ setBusy }}>
            {children}
            {busy ? (
                <div
                    className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-background/90 backdrop-blur-sm"
                    role="alert"
                    aria-live="assertive"
                >
                    <Loader2 className="size-10 animate-spin text-primary" />
                    <p className="text-lg font-semibold">{busy.title}</p>
                    <p className="max-w-sm text-center text-sm text-muted-foreground">{busy.description}</p>
                    <BusySteps steps={busy.steps} activeStepKey={busy.activeStepKey} />
                </div>
            ) : null}
        </BusyGuardContext.Provider>
    );
};
