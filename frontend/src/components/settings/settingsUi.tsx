import type { ReactNode } from "react";
import StatusBadge from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatusColor } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

// Elementi condivisi da tutte le sezioni di Impostazioni: card, riquadri, tessere di stato
// e box di caricamento hanno lo stesso aspetto ovunque, così le sezioni restano coerenti.

export type SettingsRunStatus = "idle" | "success" | "failed";

const runStatusLabels: Record<SettingsRunStatus, string> = {
    idle: "Mai eseguito",
    success: "Riuscito",
    failed: "Fallito",
};

// "Mai eseguito" resta senza colore (badge neutro): non è né un esito buono né uno cattivo.
const runStatusColors: Record<SettingsRunStatus, StatusColor | undefined> = {
    idle: undefined,
    success: "green",
    failed: "red",
};

/**
 * Su telefono le descrizioni di card e riquadri si nascondono: quasi tutte ripetono il titolo
 * con altre parole ("Utenti" / "Gestisci gli account…"), e una pagina di impostazioni diventava
 * metà testo da scorrere. Restano quelle che avvertono di qualcosa (ripristino irreversibile,
 * chiave di backup): per quelle `keepDescriptionOnMobile`. Da `sm` in su si vedono tutte.
 */
const descriptionVisibility = (keepOnMobile: boolean) => (keepOnMobile ? undefined : "max-sm:hidden");

export const SettingsSection = ({ className, children }: { className?: string; children: ReactNode }) => (
    <div className={cn("grid gap-4", className)}>{children}</div>
);

export const SettingsCard = ({
    title,
    description,
    keepDescriptionOnMobile = false,
    action,
    destructive = false,
    className,
    contentClassName,
    children,
}: {
    title: string;
    description?: ReactNode;
    keepDescriptionOnMobile?: boolean;
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
                riga è nostra e va a capo. Il testo ha una base di 10rem: se accanto restano
                meno di 10rem più i pulsanti, questi scendono sotto invece di sovrapporsi o
                uscire (i pulsanti dei Log, "Scarica log selezionato", a 768px con la barra
                laterale aperta). Prima era una colonna fino a `@2xl`: su telefono, con la
                descrizione nascosta, lasciava mezza riga vuota a destra del titolo. */}
            <div
                className={cn(
                    "flex flex-wrap justify-between gap-x-4 gap-y-2",
                    description ? "items-start" : "items-center"
                )}
            >
                {/* Senza descrizione il titolo è una parola o due: niente base minima, così i pulsanti
                    gli restano accanto anche su telefono ("Account" + aggiorna + "Nuovo utente"). */}
                <div className={cn("flex min-w-0 flex-1 flex-col gap-1", description && "basis-40")}>
                    {/* 18px/600, i valori di `text-section` ("titolo di sezione/card" nella scala
                        di index.css): a 14px/500 il titolo della card pesava meno dei titoli dei
                        `SettingsGroup` che contiene (14px/600). Scritto come `text-lg` e non come
                        `text-section` perché tailwind-merge non conosce le misure con nome, prende
                        `text-section` per un colore e non toglie il `text-sm` di CardTitle. */}
                    <CardTitle className="text-lg font-semibold group-data-[size=sm]/card:text-lg">{title}</CardTitle>
                    {description ? (
                        <CardDescription className={descriptionVisibility(keepDescriptionOnMobile)}>
                            {description}
                        </CardDescription>
                    ) : null}
                </div>
                {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
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
    keepDescriptionOnMobile = false,
    destructive = false,
    className,
    children,
}: {
    title?: string;
    description?: ReactNode;
    keepDescriptionOnMobile?: boolean;
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
                {description ? (
                    <p className={cn("text-xs text-muted-foreground", descriptionVisibility(keepDescriptionOnMobile))}>
                        {description}
                    </p>
                ) : null}
            </div>
        ) : null}
        {children}
    </div>
);

// Riga di campi affiancati. Le celle condividono le righe della griglia (subgrid), così le
// etichette che vanno a capo non spingono in basso il proprio campo rispetto a quello accanto.
// Le due colonne si decidono sulla larghezza della sezione (`@container` in SettingsPage), non
// dello schermo: a 768px con la barra laterale aperta la sezione è sotto i 500px, e con `sm`
// due campi affiancati restavano larghi 200px. `@lg` (512px): a 1280px la sezione è ~660px e
// le colonne restano due come prima.
export const SettingsFieldRow = ({ className, children }: { className?: string; children: ReactNode }) => (
    <div className={cn("grid gap-3 @lg:grid-cols-2 @lg:grid-rows-[auto_auto]", className)}>{children}</div>
);

export const SettingsField = ({ className, children }: { className?: string; children: ReactNode }) => (
    <div className={cn("grid content-start gap-2 @lg:row-span-2 @lg:grid-rows-subgrid", className)}>{children}</div>
);

// Lo stesso badge di stato delle liste e delle schede, invece di una terza mappa di colori.
export const SettingsStatusBadge = ({ status }: { status: SettingsRunStatus }) => (
    <StatusBadge color={runStatusColors[status]} className="w-fit">
        {runStatusLabels[status]}
    </StatusBadge>
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

// Colonne sulla larghezza della sezione, come `SettingsFieldRow`: una sola su telefono, due da
// `@sm` (384px, già a 768px con la barra laterale aperta), quattro da `@xl` (576px, la sezione
// a 1280px con il menu laterale è ~660px).
export const SettingsTileGrid = ({ children }: { children: ReactNode }) => (
    <div className="grid gap-2 @sm:grid-cols-2 @xl:grid-cols-4">{children}</div>
);

export const SettingsErrorNote = ({ label, message }: { label: string; message: string }) => (
    <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <span className="font-medium">{label}:</span> {message}
    </p>
);

/**
 * Avviso giallo (backup da fare prima di aggiornare, password da reinserire dopo un ripristino):
 * era copiato a mano in più card con le stesse classi.
 */
export const SettingsWarningNote = ({
    title,
    className,
    children,
}: {
    title: string;
    className?: string;
    children?: ReactNode;
}) => (
    <div
        className={cn(
            "grid gap-2 rounded-md border border-status-yellow/40 bg-status-yellow/10 p-3 text-sm",
            className
        )}
    >
        <p className="font-medium">{title}</p>
        {children}
    </div>
);

/**
 * Blocchi grigi pulsanti al posto del riquadro tratteggiato con la scritta: così il caricamento
 * ha lo stesso aspetto del resto dell'app (liste, schede). La scritta resta per i lettori di
 * schermo (`sr-only`), e `aria-busy` segnala che il contenuto sta arrivando. `destructive` non
 * cambia più l'aspetto, resta per compatibilità con chi lo passa.
 */
export const SettingsLoadingBox = ({
    label = "Caricamento impostazioni...",
}: {
    label?: string;
    destructive?: boolean;
}) => (
    <div role="status" aria-busy="true" className="grid gap-3">
        <span className="sr-only">{label}</span>
        <Skeleton aria-hidden="true" className="h-5 w-40" />
        <Skeleton aria-hidden="true" className="h-9 w-full" />
        <Skeleton aria-hidden="true" className="h-9 w-3/4" />
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
