import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

type UnhandledErrorPageProps = {
    title?: string;
    message?: string;
    onRetry?: () => void;
};

const UnhandledErrorPage = ({
    title = "Si è verificato un errore inatteso",
    message = "Abbiamo riscontrato un problema non gestito. Prova a ricaricare la pagina oppure torna alla dashboard.",
    onRetry,
}: UnhandledErrorPageProps) => {
    return (
        // `w-full`: dentro il layout la pagina sta in un `main` flex a riga, e senza larghezza piena
        // il contenitore si stringeva sulla card, che finiva schiacciata a sinistra invece che al
        // centro. Fuori dal layout (quando la mostra `AppErrorBoundary`) non cambia niente.
        <div className="flex min-h-[calc(100vh-7rem)] w-full items-center justify-center px-4">
            {/* La sfumatura finisce su `card`, non su `background`: con lo sfondo pagina ora più
                scuro delle card, la card risultava grigia invece che bianca come tutte le altre. */}
            <Card className="w-full max-w-xl border-destructive/25 bg-gradient-to-br from-destructive/5 via-card to-card">
                <CardHeader>
                    <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                        <AlertTriangle className="size-6" />
                    </div>
                    <CardTitle className="text-xl font-semibold">{title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{message}</p>
                </CardHeader>

                {/* `flex-col-reverse` sotto `sm`: "Riprova", l'azione principale, sta per ultima nel markup
                    (a destra su desktop) e su telefono finisce in cima, come nel resto dell'app. */}
                <CardContent className="flex flex-col-reverse gap-2 sm:flex-row">
                    <Button
                        className="w-full sm:w-auto"
                        variant="outline"
                        onClick={() => {
                            window.location.href = "/dashboard";
                        }}
                    >
                        <Home className="size-4" />
                        Vai alla dashboard
                    </Button>

                    <Button
                        className="w-full sm:w-auto"
                        onClick={() => {
                            if (onRetry) {
                                onRetry();
                                return;
                            }

                            window.location.reload();
                        }}
                    >
                        <RotateCcw className="size-4" />
                        Riprova
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};

export default UnhandledErrorPage;
