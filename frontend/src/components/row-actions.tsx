import TableActionButton from "@/components/table-action-button";
import type { LucideIcon } from "lucide-react";

/**
 * Un'azione di riga: l'unica definizione da cui nascono sia il pulsante nella colonna "Azioni"
 * sia la voce del menu col tasto destro (`EntityTable`). Prima i pulsanti li scriveva ogni
 * chiamante a mano; con il menu sarebbero diventati due elenchi da tenere allineati.
 */
export type RowAction = {
    key: string;
    /** La voce del menu: breve, senza l'ID ("Modifica"). */
    label: string;
    /** Etichetta e tooltip del pulsante, con l'ID per chi usa uno screen reader ("Modifica report 12"). */
    ariaLabel: string;
    icon: LucideIcon;
    onSelect: () => void;
    /** `destructive` va in rosso e, nel menu, in fondo dopo un separatore. */
    variant?: "default" | "destructive";
    /** Il colore che il pulsante prende al passaggio del mouse. */
    tone?: "primary" | "print" | "email";
    disabled?: boolean;
    /** Solo per il pulsante: scarica in anticipo il dialogo che l'azione apre. */
    onPointerEnter?: () => void;
};

const toneClassNames = {
    primary: {
        button: "bg-muted hover:bg-primary/20",
        icon: "text-muted-foreground transition-colors group-hover/button:text-primary",
    },
    print: {
        button: "bg-muted hover:bg-action-print/20",
        icon: "text-muted-foreground transition-colors group-hover/button:text-action-print",
    },
    email: {
        button: "bg-muted hover:bg-action-email/20",
        icon: "text-muted-foreground transition-colors group-hover/button:text-action-email",
    },
} as const;

/** I pulsanti della colonna "Azioni" (e delle schede su mobile) per un elenco di azioni. */
export const RowActionButtons = ({ actions }: { actions: RowAction[] }) => (
    <>
        {actions.map((action) => {
            const Icon = action.icon;
            const isDestructive = action.variant === "destructive";
            const tone = toneClassNames[action.tone ?? "primary"];

            return (
                <TableActionButton
                    key={action.key}
                    variant={isDestructive ? "destructive" : "default"}
                    size="icon-lg"
                    className={isDestructive ? undefined : tone.button}
                    disabled={action.disabled}
                    onClick={action.onSelect}
                    onPointerEnter={action.onPointerEnter}
                    aria-label={action.ariaLabel}
                >
                    <Icon className={isDestructive ? "size-5" : `size-5 ${tone.icon}`} />
                </TableActionButton>
            );
        })}
    </>
);
