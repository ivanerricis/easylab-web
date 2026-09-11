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
        <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center px-4">
            <Card className="w-full max-w-xl border-destructive/25 bg-gradient-to-br from-destructive/5 via-background to-background">
                <CardHeader>
                    <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                        <AlertTriangle className="size-6" />
                    </div>
                    <CardTitle className="text-2xl">{title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{message}</p>
                </CardHeader>

                <CardContent className="flex flex-col gap-2 sm:flex-row">
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
