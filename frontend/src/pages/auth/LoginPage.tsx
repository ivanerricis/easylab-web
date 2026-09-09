import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api";
import { useAuth } from "@/components/use-auth";

/**
 * Il challenge vive qui e non nel contesto di autenticazione: non è una sessione, è uno
 * stato che dura il tempo di digitare un codice. Ricaricando la pagina si riparte dalla
 * password, che è il comportamento giusto.
 */
const LoginPage = () => {
    useDocumentTitle("Accesso");
    const { login, completeTwoFactorLogin } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [challengeId, setChallengeId] = useState<string | null>(null);
    const [code, setCode] = useState("");
    const [isUsingRecoveryCode, setIsUsingRecoveryCode] = useState(false);

    const goToApp = () => {
        const state = location.state as { from?: { pathname: string } } | null;
        navigate(state?.from?.pathname ?? "/dashboard", { replace: true });
    };

    const backToCredentials = () => {
        setChallengeId(null);
        setCode("");
        setIsUsingRecoveryCode(false);
        setPassword("");
    };

    const handleCredentialsSubmit = async () => {
        if (isSubmitting) {
            return;
        }

        if (!username.trim() || !password) {
            toast.error("Inserisci nome utente e password");
            return;
        }

        try {
            setIsSubmitting(true);
            const result = await login(username.trim(), password);

            if (result.status === "twoFactorRequired") {
                setChallengeId(result.challengeId);
                return;
            }

            goToApp();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Accesso non riuscito"));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCodeSubmit = async () => {
        if (isSubmitting || !challengeId) {
            return;
        }

        if (!code.trim()) {
            toast.error(isUsingRecoveryCode ? "Inserisci un codice di recupero" : "Inserisci il codice di verifica");
            return;
        }

        try {
            setIsSubmitting(true);
            await completeTwoFactorLogin(challengeId, code.trim());
            goToApp();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Verifica non riuscita"));
            setCode("");

            // 410 = il challenge non esiste più, per scadenza o per troppi codici errati.
            // Insistere sul codice non porterebbe da nessuna parte: si riparte dalla password.
            if (getApiErrorStatus(error) === 410) {
                backToCredentials();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (challengeId) {
        return (
            <div className="flex h-svh w-full items-center justify-center px-4">
                <Card className="w-full max-w-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl">Verifica in due passaggi</CardTitle>
                        <CardDescription>
                            {isUsingRecoveryCode
                                ? "Inserisci uno dei codici di recupero salvati quando hai attivato la verifica."
                                : "Inserisci il codice a 6 cifre generato dalla tua app di autenticazione."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            className="grid gap-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void handleCodeSubmit();
                            }}
                        >
                            <div className="grid gap-2">
                                <Label htmlFor="loginCode">
                                    {isUsingRecoveryCode ? "Codice di recupero" : "Codice di verifica"}
                                </Label>
                                <Input
                                    id="loginCode"
                                    // `one-time-code` è ciò che permette a iOS e Android di
                                    // proporre il codice senza farlo ricopiare a mano.
                                    autoComplete="one-time-code"
                                    inputMode={isUsingRecoveryCode ? "text" : "numeric"}
                                    maxLength={isUsingRecoveryCode ? 9 : 6}
                                    autoFocus
                                    className="text-center font-mono text-lg tracking-widest"
                                    value={code}
                                    onChange={(event) => setCode(event.target.value)}
                                />
                            </div>

                            <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
                                <ShieldCheck className="size-4" />
                                {isSubmitting ? "Verifica in corso..." : "Verifica"}
                            </Button>

                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setIsUsingRecoveryCode((prev) => !prev);
                                    setCode("");
                                }}
                            >
                                {isUsingRecoveryCode
                                    ? "Usa il codice dell'app di autenticazione"
                                    : "Usa un codice di recupero"}
                            </Button>

                            <Button type="button" variant="ghost" size="sm" onClick={backToCredentials}>
                                <ArrowLeft className="size-4" />
                                Torna indietro
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex h-svh w-full items-center justify-center px-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Accedi</CardTitle>
                    <CardDescription>Inserisci le tue credenziali per accedere a EasyLab.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        className="grid gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void handleCredentialsSubmit();
                        }}
                    >
                        <div className="grid gap-2">
                            <Label htmlFor="loginUsername">Nome utente</Label>
                            <Input
                                id="loginUsername"
                                autoComplete="username"
                                autoFocus
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="loginPassword">Password</Label>
                            <div className="relative">
                                <Input
                                    id="loginPassword"
                                    type={isPasswordVisible ? "text" : "password"}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    className="pr-9"
                                />
                                <div className="absolute inset-y-0 right-1.5 flex items-center">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() => setIsPasswordVisible((prev) => !prev)}
                                        aria-label={isPasswordVisible ? "Nascondi password" : "Mostra password"}
                                    >
                                        {isPasswordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
                            <LogIn className="size-4" />
                            {isSubmitting ? "Accesso in corso..." : "Accedi"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default LoginPage;
