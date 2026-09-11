import { cn } from "@/lib/utils";

/**
 * Una voce di una scheda di dettaglio: etichetta piccola in maiuscolo, valore sotto.
 *
 * Era copiata identica in `ReportPage` e `InterventionPage`; con le schede dati di cliente e
 * tecnico sarebbero diventate quattro copie da tenere allineate a mano.
 */
const DetailItem = ({ label, value, className }: { label: string; value: string; className?: string }) => (
    <div className={cn("rounded-md border border-border/70 bg-muted/20 px-3 py-2", className)}>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 text-sm font-medium wrap-break-word">{value}</p>
    </div>
);

export default DetailItem;
