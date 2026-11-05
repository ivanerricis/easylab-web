import { Toaster as Sonner, type ToasterProps } from "sonner";
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react";
import { useTheme } from "@/components/use-theme";

const Toaster = ({ ...props }: ToasterProps) => {
    // Il tema va letto dal ThemeProvider dell'app. La versione shadcn di questo file lo
    // prendeva da `next-themes`, che qui non ha nessun provider sopra: l'hook restituiva un
    // oggetto vuoto e il toaster restava fisso su "system", cioè seguiva le preferenze del
    // sistema operativo invece della scelta fatta nell'app.
    const { theme } = useTheme();

    return (
        <Sonner
            theme={theme}
            className="toaster group"
            icons={{
                success: <CircleCheckIcon className="size-5 text-status-green-foreground" />,
                info: <InfoIcon className="size-5 text-primary-text" />,
                warning: <TriangleAlertIcon className="size-5 text-status-yellow-foreground" />,
                error: <OctagonXIcon className="size-5 text-destructive-text" />,
                loading: <Loader2Icon className="size-5 animate-spin" />,
            }}
            style={
                {
                    "--normal-bg": "var(--popover)",
                    "--normal-text": "var(--popover-foreground)",
                    "--normal-border": "var(--border)",
                    "--border-radius": "var(--radius)",
                } as React.CSSProperties
            }
            {...props}
            // Dopo `{...props}`: chi usa il Toaster passa le proprie classi (titolo, chiusura) e non
            // deve perdere il bordo colorato per tipo, che vale al posto di `richColors`.
            toastOptions={{
                ...props.toastOptions,
                classNames: {
                    toast: "cn-toast border-l-4! pr-12!",
                    success: "border-l-status-green!",
                    info: "border-l-primary!",
                    warning: "border-l-status-yellow!",
                    error: "border-l-destructive!",
                    ...props.toastOptions?.classNames,
                },
            }}
        />
    );
};

export { Toaster };
