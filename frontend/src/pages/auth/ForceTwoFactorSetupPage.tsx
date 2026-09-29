import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import RecoveryCodesDialog from "@/components/dialogs/settings/recoveryCodesDialog";
import TwoFactorSetupDialog from "@/components/dialogs/settings/twoFactorSetupDialog";
import { useAuth } from "@/components/use-auth";

const ForceTwoFactorSetupPage = () => {
    useDocumentTitle("Verifica in due passaggi");
    const { refresh, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        // Niente `state.from`: il prossimo login (magari di un altro utente) deve atterrare
        // sulla dashboard, non riaprire la pagina su cui ci si trovava prima di questo blocco.
        navigate("/login", { replace: true });
        void logout();
    };

    const [isSetupOpen, setIsSetupOpen] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

    // `TooltipProvider` qui e non da `App`: l'app lo mette in `MainLayout`, per non caricare il
    // codice dei tooltip con la pagina di accesso, e questa pagina sta fuori da `MainLayout`.
    // Ne ha bisogno la X di chiusura dei suoi dialoghi (`ui/dialog`), che ha un tooltip: senza
    // provider Radix lancia, e "Configura adesso" avrebbe fatto cadere la pagina.
    return (
        <TooltipProvider>
            <main className="flex h-svh w-full items-center justify-center px-4">
                <Card className="w-full max-w-sm">
                    <CardHeader>
                        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <ShieldCheck className="size-5" />
                        </div>
                        {/* Un h1 e non `CardTitle` (un div): è il titolo della pagina, e chi naviga per
                        intestazioni non ne trovava nessuno. Stesse classi di `CardTitle`. */}
                        <h1 data-slot="card-title" className="font-heading text-2xl leading-normal font-medium">
                            Attiva la verifica in due passaggi
                        </h1>
                        <CardDescription>
                            L&apos;account amministratore può aggiornare l&apos;app e ripristinare i backup, quindi
                            oltre alla password richiede un codice generato dal telefono. Per continuare devi
                            configurarlo.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                        <p className="text-sm text-muted-foreground">
                            Ti servirà un&apos;app di autenticazione, per esempio Google Authenticator, Aegis o
                            1Password. Riceverai anche otto codici di recupero da conservare per quando il telefono non
                            è a portata di mano.
                        </p>

                        <Button type="button" className="w-full" autoFocus onClick={() => setIsSetupOpen(true)}>
                            <ShieldCheck className="size-4" />
                            Configura adesso
                        </Button>

                        <Button type="button" variant="ghost" className="text-muted-foreground" onClick={handleLogout}>
                            Esci
                        </Button>
                    </CardContent>
                </Card>

                <TwoFactorSetupDialog open={isSetupOpen} onOpenChange={setIsSetupOpen} onEnabled={setRecoveryCodes} />

                {/* Solo alla chiusura di questo dialogo si aggiorna l'utente: farlo prima
                smonterebbe la pagina, e con lei gli unici codici di recupero in chiaro. */}
                <RecoveryCodesDialog
                    open={recoveryCodes !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setRecoveryCodes(null);
                            void refresh();
                        }
                    }}
                    codes={recoveryCodes ?? []}
                />
            </main>
        </TooltipProvider>
    );
};

export default ForceTwoFactorSetupPage;
