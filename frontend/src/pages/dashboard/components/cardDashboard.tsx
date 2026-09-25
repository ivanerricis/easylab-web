import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Props = Readonly<{
    text: string;
    mobileText?: string;
    icon: LucideIcon;
    number: string;
    iconColor?: string;
    onClick?: () => void;
}>;

/**
 * La disposizione interna delle schede della dashboard, condivisa con quella degli incassi
 * (che è un pulsante e non passa da qui): etichetta, icona, numero.
 *
 * Su mobile le schede sono un terzo dello schermo e l'icona sta sulla riga del numero,
 * lasciando all'etichetta tutta la larghezza. Sulla stessa riga dell'etichetta, a 360px
 * "Programmati" spingeva l'icona fuori dal bordo interno (a 320px fuori dalla scheda) e
 * "Incassi mese" veniva troncato fino a 375px. Da `sm` in su le schede sono larghe almeno
 * 14rem e l'icona torna in alto a destra.
 *
 * Le varianti `sm:@max-[80rem]:` rimpiccioliscono le schede quando non stanno tutte su una
 * riga, cioè quando la finestra non è a tutto schermo su un monitor grande (il contenitore è in
 * `DashboardPage`): su due o tre righe, alte 94px l'una, si prendevano 200–340px e al
 * calendario ne restavano 400 a 1024×768 e 1280×800. Più strette di padding, etichetta a 14px
 * e numero a 20px scendono a circa 70px per riga. A tutto schermo (sei in riga) e su telefono
 * restano come sono.
 */
export const dashboardCardLayoutClassName =
    "grid w-full flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1 gap-y-0.5 rounded-lg p-2 shadow sm:min-w-56 sm:items-start sm:gap-y-1 sm:p-4 sm:@max-[80rem]:gap-y-0.5 sm:@max-[80rem]:px-3.5 sm:@max-[80rem]:py-2.5";
export const dashboardCardLabelClassName =
    "col-span-2 text-xs wrap-break-word sm:col-span-1 sm:text-base sm:@max-[80rem]:text-sm";
export const dashboardCardIconClassName =
    "col-start-2 row-start-2 size-4 shrink-0 sm:row-start-1 sm:size-5 sm:@max-[80rem]:size-4";
export const dashboardCardValueClassName = "row-start-2 text-lg font-bold sm:text-2xl sm:@max-[80rem]:text-xl";

const CardDashboard = ({ text, mobileText, icon: Icon, number, iconColor, onClick }: Props) => {
    const isInteractive = onClick != null;

    return (
        <div
            className={cn(
                dashboardCardLayoutClassName,
                "border bg-card",
                // `focus-outline`: lo stesso focus dei pulsanti (index.css). Senza, la card, che
                // è un `role="button"` raggiungibile col Tab, mostrava l'outline del browser.
                isInteractive && "cursor-pointer focus-outline *:*:cursor-pointer *:cursor-pointer hover:bg-accent/35"
            )}
            onClick={onClick}
            role={isInteractive ? "button" : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            onKeyDown={
                isInteractive
                    ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onClick();
                          }
                      }
                    : undefined
            }
        >
            <span className={dashboardCardLabelClassName}>
                {mobileText ? (
                    <>
                        <span className="sm:hidden">{mobileText}</span>
                        <span className="hidden sm:inline">{text}</span>
                    </>
                ) : (
                    text
                )}
            </span>
            <Icon className={cn(dashboardCardIconClassName, "text-muted-foreground", iconColor)} />
            <span className={dashboardCardValueClassName}>{number}</span>
        </div>
    );
};

export default CardDashboard;
