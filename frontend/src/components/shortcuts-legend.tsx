import { useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Kbd from "@/components/ui/kbd";
import { usePageShortcut } from "@/hooks/usePageShortcut";
import { getStoredKeyboardShortcutsEnabled } from "@/lib/theme";
import { cn, modifierKey } from "@/lib/utils";

const groups: { heading: string; rows: { keys: string[]; label: string }[] }[] = [
    {
        heading: "Ovunque",
        rows: [
            { keys: [modifierKey, "K"], label: "Cerca clienti, report e interventi" },
            { keys: ["?"], label: "Questo elenco" },
        ],
    },
    {
        heading: "Nelle pagine a elenco",
        rows: [
            { keys: ["/"], label: "Vai alla ricerca della pagina" },
            { keys: ["Esc"], label: "Svuota la ricerca, o toglie il focus se è già vuota" },
            { keys: ["n"], label: "Crea (report, intervento, cliente, dispositivo…)" },
        ],
    },
    {
        heading: "Nella dashboard",
        rows: [
            // Due pulsanti di creazione, quindi due lettere: vedi `DashboardPage`.
            { keys: ["r"], label: "Nuovo report" },
            { keys: ["i"], label: "Nuovo intervento" },
        ],
    },
    {
        heading: "Nelle finestre",
        rows: [
            { keys: [modifierKey, "Invio"], label: "Salva" },
            { keys: ["Esc"], label: "Chiudi" },
        ],
    },
];

/**
 * L'elenco delle scorciatoie, aperto con "?" da qualunque pagina.
 *
 * Senza, l'unico modo per scoprirle era trovarle per caso: i due indizi a schermo — il chip
 * "Ctrl K" sul pulsante di ricerca e il badge "/" nel campo — coprono due scorciatoie su sette,
 * e la documentazione parla a chi amministra il server, non a chi sta al banco.
 */
const ShortcutsLegend = () => {
    const [open, setOpen] = useState(false);
    // Letta all'apertura: la preferenza può cambiare in Impostazioni mentre la pagina è aperta.
    const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
    // "?" funziona anche con le scorciatoie spente: è da qui che si scopre dove riaccenderle.
    usePageShortcut(
        "?",
        () => {
            setShortcutsEnabled(getStoredKeyboardShortcutsEnabled());
            setOpen(true);
        },
        { alwaysActive: true }
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="border! border-primary! sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-lg">Scorciatoie da tastiera</DialogTitle>
                    <DialogDescription>
                        Non funzionano mentre si scrive in un campo: lì le lettere restano lettere.
                    </DialogDescription>
                </DialogHeader>

                {/* Dove si spengono (o si riaccendono) quelle a un tasto: "/", "n", "r", "i". Le
                    combinazioni con Ctrl e i tasti delle finestre restano sempre attivi. */}
                <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {shortcutsEnabled
                        ? "Le scorciatoie a un tasto si possono disattivare in "
                        : "Le scorciatoie a un tasto sono disattivate. Si riattivano in "}
                    <Link
                        to="/settings?section=theme"
                        className="rounded-sm font-medium text-foreground underline underline-offset-2 focus-outline outline-none"
                        onClick={() => setOpen(false)}
                    >
                        Impostazioni › Tema
                    </Link>
                    .
                </p>

                <div className="flex flex-col gap-4">
                    {groups.map((group, index) => (
                        <div key={group.heading} className={cn("flex flex-col gap-2", index > 0 && "border-t pt-4")}>
                            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                {group.heading}
                            </p>
                            {group.rows.map((row) => (
                                <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
                                    <span>{row.label}</span>
                                    <span className="flex shrink-0 items-center gap-1">
                                        {row.keys.map((key) => (
                                            <Kbd key={key}>{key}</Kbd>
                                        ))}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ShortcutsLegend;
