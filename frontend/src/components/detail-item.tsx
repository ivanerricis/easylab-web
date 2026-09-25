import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createContext, useContext, type ReactNode } from "react";

/**
 * Come `DetailGrid` dispone le voci: `grid` (etichetta sopra, valore sotto, in colonne) o `rows`
 * (una riga per voce, etichetta a sinistra e valore a destra, divise da una linea sottile: lo
 * stesso disegno del riepilogo in cima alle schede su telefono, `DetailStats`). La voce lo legge
 * da qui invece che da una prop, così le pagine non devono ripeterlo su ogni `DetailItem`.
 */
type DetailLayout = "grid" | "rows";

const DetailLayoutContext = createContext<DetailLayout>("grid");

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
const DetailItem = ({
    label,
    value,
    longText = false,
    className,
}: {
    label: string;
    value: ReactNode;
    /**
     * Testo libero, di quelli che nel modulo si scrivono in un'area di testo (problema, descrizione,
     * note). Nel layout a righe, su telefono, va sotto l'etichetta e allineato a sinistra: a destra
     * di un'etichetta, in una colonna stretta, diventava una fila di righe corte allineate a destra,
     * faticose da leggere. Da `sm` in su c'è spazio e resta affiancato come le altre voci.
     */
    longText?: boolean;
    className?: string;
}) => {
    const layout = useContext(DetailLayoutContext);

    if (layout === "rows") {
        // Un testo lungo vuoto ("-") non ha niente da andare a capo: sotto l'etichetta lasciava un
        // trattino solo su una riga sua, e la voce era alta il doppio delle vicine senza motivo.
        // Resta affiancato come una voce qualsiasi.
        const stacksOnMobile = longText && value !== "-";

        // `items-baseline`: con un valore che va a capo l'etichetta resta allineata alla prima
        // riga del valore, non al centro del blocco.
        return (
            <div
                className={cn(
                    // Linea sotto ogni voce, non `divide-y` sul contenitore: con più colonne `divide-y`
                    // metterebbe la linea sopra la seconda voce della prima riga ma non sopra la
                    // prima, sfalsandole. L'ultima riga e il margine sopra la prima li taglia
                    // `DetailGrid`.
                    "flex min-w-0 border-b border-border py-2.5",
                    // Un testo lungo occupa tutta la riga anche quando la griglia ha più colonne.
                    longText && "col-span-full",
                    stacksOnMobile
                        ? "flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                        : "items-baseline justify-between gap-4",
                    className
                )}
            >
                <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
                <dd
                    className={cn(
                        "min-w-0 text-sm font-medium wrap-break-word text-foreground",
                        stacksOnMobile ? "sm:text-right" : "text-right"
                    )}
                >
                    {value}
                </dd>
            </div>
        );
    }

    return (
        <div className={cn("min-w-0", className)}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium wrap-break-word text-foreground">{value}</dd>
        </div>
    );
};

/**
 * La griglia delle voci: un `dl`, così le coppie etichetta/valore sono tali anche per chi usa
 * un lettore di schermo. Le colonne le decide la pagina (`className`, es. `sm:grid-cols-2`); la
 * spaziatura è qui, uguale per tutte.
 *
 * Con `layout="rows"` le righe possono stare anche su più colonne: nelle card larghe quanto la
 * pagina (i dati di cliente, collaboratore e tecnico) una colonna sola avrebbe messo il valore a
 * mille pixel dalla sua etichetta. Ogni voce ha la sua linea sotto; il `dl` sborda di 10px sopra e
 * sotto (`-my-2.5`) dentro un contenitore che taglia, così spariscono il margine sopra la prima
 * riga e la linea sotto l'ultima, qualunque sia il numero di colonne.
 */
const DetailGrid = ({
    className,
    layout = "grid",
    children,
}: {
    className?: string;
    layout?: DetailLayout;
    children: ReactNode;
}) => (
    <DetailLayoutContext.Provider value={layout}>
        {layout === "rows" ? (
            <div className="overflow-hidden">
                <dl className={cn("-my-2.5 grid gap-x-8", className)}>{children}</dl>
            </div>
        ) : (
            <dl className={cn("grid gap-x-6 gap-y-4", className)}>{children}</dl>
        )}
    </DetailLayoutContext.Provider>
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
    title: ReactNode;
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
