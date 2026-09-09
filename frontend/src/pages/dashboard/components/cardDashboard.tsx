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

const CardDashboard = ({ text, mobileText, icon: Icon, number, iconColor, onClick }: Props) => {
    const isInteractive = onClick != null;

    return (
        <div
            className={cn(
                "flex w-full flex-1 flex-col gap-0.5 rounded-lg border bg-card p-2 shadow sm:min-w-56 sm:gap-1 sm:p-4",
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
            <div className="flex items-start justify-between gap-1">
                <span className="text-xs sm:text-base">
                    {mobileText ? (
                        <>
                            <span className="sm:hidden">{mobileText}</span>
                            <span className="hidden sm:inline">{text}</span>
                        </>
                    ) : (
                        text
                    )}
                </span>
                <Icon className={cn("size-4 shrink-0 text-muted-foreground sm:size-5", iconColor)} />
            </div>
            <span className="text-lg font-bold sm:text-2xl">{number}</span>
        </div>
    );
};

export default CardDashboard;
