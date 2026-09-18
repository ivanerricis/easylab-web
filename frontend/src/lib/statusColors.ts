/** I tre colori di stato: gli stessi nomi di `data-status-color` sulle righe della tabella. */
export type StatusColor = "red" | "yellow" | "green";

type StatusStyle = { stripe: string; badge: string; dot: string };

/**
 * Le classi di ciascun colore, tutte sui token `--status-*` di `index.css`. Prima le schede di
 * report e intervento e il popover del calendario avevano ciascuno la sua mappa con colori
 * Tailwind grezzi (emerald/amber/rose da una parte, green/yellow/red dall'altra): una modifica ai
 * token, come la correzione del contrasto in BACKLOG, non li avrebbe raggiunti.
 */
export const statusStyles: Record<StatusColor, StatusStyle> = {
    red: {
        stripe: "bg-status-red",
        badge: "bg-status-red/12 text-status-red-foreground ring-status-red/25",
        dot: "bg-status-red",
    },
    yellow: {
        stripe: "bg-status-yellow",
        badge: "bg-status-yellow/15 text-status-yellow-foreground ring-status-yellow/35",
        dot: "bg-status-yellow",
    },
    green: {
        stripe: "bg-status-green",
        badge: "bg-status-green/12 text-status-green-foreground ring-status-green/25",
        dot: "bg-status-green",
    },
};

export const isStatusColor = (value: string | undefined): value is StatusColor =>
    value === "red" || value === "yellow" || value === "green";
