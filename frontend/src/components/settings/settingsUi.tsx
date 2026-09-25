import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Elementi condivisi da tutte le sezioni di Impostazioni: card, riquadri, tessere di stato
// e box di caricamento hanno lo stesso aspetto ovunque, così le sezioni restano coerenti.

export type SettingsRunStatus = "idle" | "success" | "failed";

const runStatusLabels: Record<SettingsRunStatus, string> = {
    idle: "Mai eseguito",
    success: "Riuscito",
    failed: "Fallito",
};

const runStatusClasses: Record<SettingsRunStatus, string> = {
    idle: "bg-muted text-muted-foreground",
    success: "bg-status-green/15 text-status-green-foreground",
    failed: "bg-destructive/15 text-destructive",
};

export const SettingsSection = ({ className, children }: { className?: string; children: ReactNode }) => (
    <div className={cn("grid gap-4", className)}>{children}</div>
);

export const SettingsCard = ({
    title,
    description,
    action,
    destructive = false,
    className,
    contentClassName,
    children,
}: {
    title: string;
    description?: ReactNode;
    action?: ReactNode;
    destructive?: boolean;
    className?: string;
    contentClassName?: string;
    children: ReactNode;
}) => (
    <Card size="sm" className={cn("shadow-sm", destructive ? "border-destructive/30" : "border-primary/15", className)}>
        <CardHeader
            className={cn(
                // Il padding verticale della card sta sul contenitore, non sull'header: senza
                // annullarlo con -mt e ridarlo con pt, lo sfondo colorato lascerebbe una striscia
                // bianca sopra, non arrivando all'angolo arrotondato della card.
                "-mt-4 border-b pt-4",
                destructive ? "border-destructive/15 bg-destructive/5" : "border-primary/10 bg-muted/20"
            )}
        >
            {/* Il layout a due colonne di CardHeader (via CardAction) manda l'azione fuori
                dalla card quando il testo dei pulsanti non ci sta accanto al titolo: qui la
                riga è nostra, quindi in una sezione stretta scende sotto invece di sovrapporsi.
                Si decide sulla larghezza della sezione (`@container` in SettingsPage) e non
                dello schermo: a 768px con la barra laterale aperta la sezione è larga circa
                440px, e con `sm` i pulsanti dei Log ("Scarica log selezionato") uscivano dalla
                card. */}
            <div className="flex flex-col gap-2 @2xl:flex-row @2xl:items-start @2xl:justify-between">
                <div className="flex flex-col gap-1">
                    {/* 18px/600, i valori di `text-section` ("titolo di sezione/card" nella scala
                        di index.css): a 14px/500 il titolo della card pesava meno dei titoli dei
                        `SettingsGroup` che contiene (14px/600). Scritto come `text-lg` e non come
                        `text-section` perché tailwind-merge non conosce le misure con nome, prende
                        `text-section` per un colore e non toglie il `text-sm` di CardTitle. */}
                    <CardTitle className="text-lg font-semibold group-data-[size=sm]/card:text-lg">{title}</CardTitle>
                    {description ? <CardDescription>{description}</CardDescription> : null}
                </div>
                {action ? <div className="flex flex-wrap items-center gap-2 @2xl:shrink-0">{action}</div> : null}
            </div>
        </CardHeader>
        {/* Nessun `pt` qui: lo spazio sotto il bordo dell'header lo dà già il `gap-4` della
            card. Con anche `pt-4` erano 32px sotto il bordo contro i 16px sopra e in fondo. */}
        <CardContent className={cn("grid gap-3", contentClassName)}>{children}</CardContent>
    </Card>
);

export const SettingsGroup = ({
    title,
    description,
    destructive = false,
    className,
    children,
}: {
    title?: string;
    description?: ReactNode;
    destructive?: boolean;
    className?: string;
    children: ReactNode;
}) => (
    <div
        className={cn(
            "grid content-start gap-3 rounded-md border bg-muted/20 p-3",
            destructive ? "border-destructive/15" : "border-primary/15",
            className
        )}
    >
        {title ? (
            <div className="grid gap-1">
                <p className="text-sm font-semibold">{title}</p>
                {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
            </div>
        ) : null}
        {children}
    </div>
);

// Riga di campi affiancati. Le celle condividono le righe della griglia (subgrid), così le
// etichette che vanno a capo non spingono in basso il proprio campo rispetto a quello accanto.
export const SettingsFieldRow = ({ className, children }: { className?: string; children: ReactNode }) => (
    <div className={cn("grid gap-3 sm:grid-cols-2 sm:grid-rows-[auto_auto]", className)}>{children}</div>
);

export const SettingsField = ({ className, children }: { className?: string; children: ReactNode }) => (
    <div className={cn("grid content-start gap-2 sm:row-span-2 sm:grid-rows-subgrid", className)}>{children}</div>
);

export const SettingsStatusBadge = ({ status }: { status: SettingsRunStatus }) => (
    <span
        className={cn(
            "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
            runStatusClasses[status]
        )}
    >
        {runStatusLabels[status]}
    </span>
);

export const SettingsTile = ({
    label,
    value,
    status,
    highlight = false,
}: {
    label: string;
    value: ReactNode;
    status?: SettingsRunStatus;
    highlight?: boolean;
}) => (
    <div className="grid content-start gap-1 rounded-md border border-primary/15 bg-muted/20 p-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("text-sm font-semibold", highlight && "text-primary-text")}>{value}</span>
        {status ? <SettingsStatusBadge status={status} /> : null}
    </div>
);

export const SettingsTileGrid = ({ children }: { children: ReactNode }) => (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
);

export const SettingsErrorNote = ({ label, message }: { label: string; message: string }) => (
    <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <span className="font-medium">{label}:</span> {message}
    </p>
);

export const SettingsLoadingBox = ({
    label = "Caricamento impostazioni...",
    destructive = false,
}: {
    label?: string;
    destructive?: boolean;
}) => (
    <div
        className={cn(
            "rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center text-muted-foreground",
            destructive ? "border-destructive/20" : "border-primary/20"
        )}
    >
        {label}
    </div>
);

export const SettingsEmptyBox = ({ children }: { children: ReactNode }) => (
    <div className="rounded-md border border-dashed border-primary/20 bg-muted/30 px-4 py-8 text-center text-muted-foreground">
        {children}
    </div>
);

export const SettingsActions = ({ children }: { children: ReactNode }) => (
    <div className="flex flex-wrap justify-end gap-2">{children}</div>
);
