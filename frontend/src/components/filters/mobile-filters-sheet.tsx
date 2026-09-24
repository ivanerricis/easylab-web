import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

type MobileFiltersSheetProps = {
    /** Quanti filtri sono attivi (l'ordinamento non conta: non toglie righe): il numero sul pulsante. */
    activeCount: number;
    children: ReactNode;
};

/**
 * Su telefono i filtri di una lista non stanno in una barra: stato, tipo, ordinamento e le due
 * date occupavano da soli tre righe sopra l'elenco. Qui restano dietro un solo pulsante, che apre
 * un pannello dal basso; il numero sul pulsante dice se c'è qualcosa di attivo anche a pannello
 * chiuso, così una lista filtrata non sembra una lista vuota "senza motivo".
 *
 * I controlli sono i figli, gli stessi della barra desktop: il pannello non ne duplica la logica.
 */
const MobileFiltersSheet = ({ activeCount, children }: MobileFiltersSheetProps) => {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline" size="lg" className="h-10 gap-2 px-3" aria-label="Filtri">
                    <SlidersHorizontal className="size-4" />
                    <span>Filtri</span>
                    {activeCount > 0 ? (
                        <span
                            aria-label={`${activeCount} attivi`}
                            className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                        >
                            {activeCount}
                        </span>
                    ) : null}
                </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-xl">
                <SheetHeader>
                    <SheetTitle className="text-section">Filtri</SheetTitle>
                    <SheetDescription className="sr-only">Filtra e ordina l&apos;elenco.</SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-4 overflow-y-auto px-4">{children}</div>
                <SheetFooter>
                    <SheetClose asChild>
                        <Button size="lg" className="h-10">
                            Mostra risultati
                        </Button>
                    </SheetClose>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
};

/** Un controllo del pannello con la sua etichetta sopra: nel pannello non c'è più l'icona a dire di che filtro si tratta. */
export const MobileFilterField = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        {children}
    </div>
);

export default MobileFiltersSheet;
