import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { type ReactNode, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError } from "@/components/form-field";
import { fieldProps } from "@/lib/formField";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api";
import { useAuth } from "@/components/use-auth";
import { brandName, brandSubtitle } from "@/lib/brand";
import BrandLogo from "@/components/brand-logo";

/**
 * Il contenitore delle due schede (password e codice): il marchio del laboratorio sopra la card,
 * lo stesso della barra laterale, così chi entra vede lo stesso nome e lo stesso logo prima e
 * dopo l'accesso. Prima la pagina non aveva né logo né nome, e il testo diceva "EasyLab". È un
 * `<main>`: la pagina ne era priva, e i lettori di schermo non avevano un punto d'arrivo.
 *
 * Il titolo della scheda ("Accedi", "Verifica in due passaggi") e il sottotitolo non si vedono
 * più: ripetevano il bottone e le etichette dei campi, e il marchio basta a dire dove si è. Il
 * titolo resta per i lettori di schermo, come `<h1>` nascosto.
 */
const LoginShell = ({ title, children }: { title: string; children: ReactNode }) => (
    <main className="flex min-h-svh w-full flex-col items-center justify-center gap-6 px-4 py-8">
        <h1 className="sr-only">{title}</h1>
        <div className="flex items-center gap-3">
            {/* `alt` vuoto: il nome è scritto subito accanto, ripeterlo non aggiunge niente. */}
            <div className="size-14 shrink-0 overflow-hidden rounded-lg border bg-background shadow-sm">
                <BrandLogo alt="" className="object-cover" />
            </div>
            <div className="leading-tight">
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

    // Gli errori stanno sotto il campo che riguardano, come nei dialoghi (vedi `FormField`).
    // Qui anche il rifiuto del server: sulla pagina di accesso è l'errore più comune ("password
    // errata"), e un toast che sparisce da solo si perdeva. Va sotto la password perché il
    // server, di proposito, non dice quale delle due credenziali sia sbagliata.
    const [usernameError, setUsernameError] = useState<string>();
    const [passwordError, setPasswordError] = useState<string>();
    const [codeError, setCodeError] = useState<string>();

    // Si torna all'indirizzo intero da cui `RequireAuth` ha mandato qui, filtri compresi: prima
    // si teneva solo il percorso, e un link a una lista filtrata (`/reports?status=…`) aperto a
    // sessione scaduta portava alla lista senza filtri.
    const goToApp = () => {
        const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
        navigate(
            from?.pathname
                ? { pathname: from.pathname, search: from.search ?? "", hash: from.hash ?? "" }
                : "/dashboard",
            { replace: true }
        );
    };

    const backToCredentials = (reason?: string) => {
        setChallengeId(null);
        setCode("");
        setCodeError(undefined);
        setIsUsingRecoveryCode(false);
        setPassword("");
        setPasswordError(reason);
    };

    const handleCredentialsSubmit = async () => {
        if (isSubmitting) {
            return;
        }

        const nextUsernameError = username.trim() ? undefined : "Inserisci il nome utente";
        const nextPasswordError = password ? undefined : "Inserisci la password";
        setUsernameError(nextUsernameError);
        setPasswordError(nextPasswordError);

        if (nextUsernameError || nextPasswordError) {
            document.getElementById(nextUsernameError ? "loginUsername" : "loginPassword")?.focus();
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
            setPasswordError(getApiErrorMessage(error, "Accesso non riuscito"));
            setPassword("");
            document.getElementById("loginPassword")?.focus();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCodeSubmit = async () => {
        if (isSubmitting || !challengeId) {
            return;
        }

        if (!code.trim()) {
            setCodeError(isUsingRecoveryCode ? "Inserisci un codice di recupero" : "Inserisci il codice di verifica");
            codeInputRef.current?.focus();
            return;
        }

        try {
            setIsSubmitting(true);
            await completeTwoFactorLogin(challengeId, code.trim());
            goToApp();
        } catch (error) {
            const message = getApiErrorMessage(error, "Verifica non riuscita");
            setCode("");

            // 410 = il challenge non esiste più, per scadenza o per troppi codici errati.
            // Insistere sul codice non porterebbe da nessuna parte: si riparte dalla password,
            // e il motivo compare sotto la password, dove ora si trova l'utente.
            if (getApiErrorStatus(error) === 410) {
                backToCredentials(message);
            } else {
                setCodeError(message);
                // Il clic su "Verifica" ha lasciato il focus sul bottone.
                codeInputRef.current?.focus();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (challengeId) {
        return (
            <LoginShell title="Verifica in due passaggi">
                <Card className="w-full max-w-sm">
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
                                        {...fieldProps("loginCode", { error: codeError })}
                                        // `one-time-code` è ciò che permette a iOS e Android di
                                        // proporre il codice senza farlo ricopiare a mano.
                                        autoComplete="one-time-code"
                                        inputMode="text"
                                        // Un codice, non una parola: la tastiera del telefono non
                                        // deve metterci la maiuscola né "correggerlo".
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        maxLength={9}
                                        autoFocus
                                        className="text-center font-mono text-lg tracking-widest"
                                        value={code}
                                        onChange={(event) => {
                                            setCode(event.target.value);
                                            setCodeError(undefined);
                                        }}
                                    />
                                ) : (
                                    <InputOTP
                                        key="totp"
                                        ref={codeInputRef}
                                        {...fieldProps("loginCode", { error: codeError })}
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        pattern={REGEXP_ONLY_DIGITS}
                                        autoFocus
                                        containerClassName="justify-center"
                                        value={code}
                                        onChange={(value) => {
                                            setCode(value);
                                            setCodeError(undefined);
                                        }}
                                    >
                                        <InputOTPGroup>
                                            {/* Le caselle sono `div` disegnati sopra l'input vero,
                                                che è invisibile: il bordo rosso va chiesto a loro. */}
                                            {[0, 1, 2, 3, 4, 5].map((index) => (
                                                <InputOTPSlot
                                                    key={index}
                                                    index={index}
                                                    aria-invalid={codeError ? true : undefined}
                                                />
                                            ))}
                                        </InputOTPGroup>
                                    </InputOTP>
                                )}
                                <FieldError id="loginCode" error={codeError} />
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
                                    setCodeError(undefined);
                                }}
                            >
                                {isUsingRecoveryCode
                                    ? "Usa il codice dell'app di autenticazione"
                                    : "Usa un codice di recupero"}
                            </Button>

                            <Button type="button" variant="ghost" size="sm" onClick={() => backToCredentials()}>
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
        <LoginShell title="Accedi">
            <Card className="w-full max-w-sm">
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
                                {...fieldProps("loginUsername", { error: usernameError })}
                                autoComplete="username"
                                // Niente correttore: un nome utente non è una parola del
                                // dizionario, e la tastiera del telefono lo "correggeva" in un
                                // altro, che il server rifiuta. La maiuscola automatica invece
                                // resta: i nomi utente sono di norma con l'iniziale maiuscola
                                // ("Ivan"), e il confronto del server è esatto di proposito.
                                autoCorrect="off"
                                spellCheck={false}
                                autoFocus
                                value={username}
                                onChange={(event) => {
                                    setUsername(event.target.value);
                                    setUsernameError(undefined);
                                }}
                            />
                            <FieldError id="loginUsername" error={usernameError} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="loginPassword">Password</Label>
                            <div className="relative">
                                <Input
                                    {...fieldProps("loginPassword", { error: passwordError })}
                                    type={isPasswordVisible ? "text" : "password"}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(event) => {
                                        setPassword(event.target.value);
                                        setPasswordError(undefined);
                                    }}
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
                            <FieldError id="loginPassword" error={passwordError} />
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
