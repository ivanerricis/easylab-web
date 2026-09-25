import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { type ReactNode, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api";
import { useAuth } from "@/components/use-auth";
import { brandLogoUrl, brandName, brandSubtitle } from "@/lib/brand";

/**
 * Il contenitore delle due schede (password e codice): il marchio del laboratorio sopra la card,
 * lo stesso della barra laterale, così chi entra vede lo stesso nome e lo stesso logo prima e
 * dopo l'accesso. Prima la pagina non aveva né logo né nome, e il testo diceva "EasyLab". È un
 * `<main>`: la pagina ne era priva, e i lettori di schermo non avevano un punto d'arrivo.
 */
const LoginShell = ({ children }: { children: ReactNode }) => (
    <main className="flex min-h-svh w-full flex-col items-center justify-center gap-6 px-4 py-8">
        <div className="flex flex-col items-center gap-3">
            {/* `alt` vuoto: il nome è scritto subito sotto, ripeterlo non aggiunge niente. */}
            <img src={brandLogoUrl} alt="" className="size-14 rounded-lg border bg-background object-cover shadow-sm" />
            <div className="text-center leading-tight">
                <p className="text-lg font-semibold">{brandName}</p>
                <p className="text-sm text-muted-foreground">{brandSubtitle}</p>
            </div>
        </div>
        {children}
    </main>
);

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
    const codeInputRef = useRef<HTMLInputElement>(null);

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
            } else {
                // Il clic su "Verifica" ha lasciato il focus sul bottone.
                codeInputRef.current?.focus();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (challengeId) {
        return (
            <LoginShell>
                <Card className="w-full max-w-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl">
                            <h1>Verifica in due passaggi</h1>
                        </CardTitle>
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
                                {isUsingRecoveryCode ? (
                                    <Input
                                        // La `key` forza un input nuovo: le due schermate hanno la
                                        // stessa struttura, e senza React riuserebbe quello del nome
                                        // utente — `autoFocus` scatta solo al montaggio. Cambia anche
                                        // passando al codice di recupero, per riprendere il focus
                                        // tolto dal clic sul link.
                                        key="recovery"
                                        ref={codeInputRef}
                                        id="loginCode"
                                        // `one-time-code` è ciò che permette a iOS e Android di
                                        // proporre il codice senza farlo ricopiare a mano.
                                        autoComplete="one-time-code"
                                        inputMode="text"
                                        maxLength={9}
                                        autoFocus
                                        className="text-center font-mono text-lg tracking-widest"
                                        value={code}
                                        onChange={(event) => setCode(event.target.value)}
                                    />
                                ) : (
                                    <InputOTP
                                        key="totp"
                                        ref={codeInputRef}
                                        id="loginCode"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        pattern={REGEXP_ONLY_DIGITS}
                                        autoFocus
                                        containerClassName="justify-center"
                                        value={code}
                                        onChange={setCode}
                                    >
                                        <InputOTPGroup>
                                            <InputOTPSlot index={0} />
                                            <InputOTPSlot index={1} />
                                            <InputOTPSlot index={2} />
                                            <InputOTPSlot index={3} />
                                            <InputOTPSlot index={4} />
                                            <InputOTPSlot index={5} />
                                        </InputOTPGroup>
                                    </InputOTP>
                                )}
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
            </LoginShell>
        );
    }

    return (
        <LoginShell>
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">
                        <h1>Accedi</h1>
                    </CardTitle>
                    <CardDescription>Inserisci le tue credenziali per accedere.</CardDescription>
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
        </LoginShell>
    );
};

export default LoginPage;
