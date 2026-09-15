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
 */
export const dashboardCardLayoutClassName =
    "grid w-full flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1 gap-y-0.5 rounded-lg p-2 shadow sm:min-w-56 sm:items-start sm:gap-y-1 sm:p-4";
export const dashboardCardLabelClassName = "col-span-2 text-xs wrap-break-word sm:col-span-1 sm:text-base";
export const dashboardCardIconClassName = "col-start-2 row-start-2 size-4 shrink-0 sm:row-start-1 sm:size-5";
export const dashboardCardValueClassName = "row-start-2 text-lg font-bold sm:text-2xl";

const CardDashboard = ({ text, mobileText, icon: Icon, number, iconColor, onClick }: Props) => {
    const isInteractive = onClick != null;

    return (
        <div
            className={cn(
                dashboardCardLayoutClassName,
                "border bg-card",
                isInteractive && "cursor-pointer *:*:cursor-pointer *:cursor-pointer hover:bg-accent/35"
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
