import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Una voce di una scheda di dettaglio: etichetta piccola e grigia, valore sotto.
 *
 * Era copiata identica in `ReportPage` e `InterventionPage`; con le schede dati di cliente e
 * tecnico sarebbero diventate quattro copie da tenere allineate a mano.
 *
 * Niente più bordo e sfondo attorno a ogni voce: dentro una card, dentro la pagina, era una
 * scatola nella scatola nella scatola, e l'occhio leggeva i riquadri prima dei valori. Ora le
 * voci si distinguono solo per colore e peso, e a separarle basta la spaziatura della griglia
 * (`DetailGrid`). L'etichetta non è più in maiuscolo: accanto ai titoli di sezione e ai valori
 * era il terzo stile di testo in gara per l'attenzione.
 */
const DetailItem = ({ label, value, className }: { label: string; value: ReactNode; className?: string }) => (
    <div className={cn("min-w-0", className)}>
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium wrap-break-word text-foreground">{value}</dd>
    </div>
);

/**
 * La griglia delle voci: un `dl`, così le coppie etichetta/valore sono tali anche per chi usa
 * un lettore di schermo. Le colonne le decide la pagina; la spaziatura è qui, uguale per tutte,
 * ed è più larga di prima perché ora è lei, non un bordo, a dire dove finisce una voce.
 */
const DetailGrid = ({ className, children }: { className?: string; children: ReactNode }) => (
    <dl className={cn("grid gap-x-6 gap-y-4", className)}>{children}</dl>
);

/**
 * Una sezione di una scheda: card con titolo e contenuto. I titoli erano blu come i titoli delle
 * card dei numeri in alto, e competevano con il nome nell'intestazione e con i collegamenti
 * (anch'essi blu); ora sono nel colore del testo, in grassetto: il blu resta a ciò che si clicca.
 */
const DetailSection = ({
    title,
    className,
    contentClassName,
    children,
}: {
    title: string;
    className?: string;
    contentClassName?: string;
    children: ReactNode;
}) => (
    <Card className={cn("gap-4", className)}>
        <CardHeader>
            <CardTitle className="font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
);

export { DetailGrid, DetailSection };
export default DetailItem;
