import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { changeOwnPassword, getApiErrorMessage } from "@/lib/api";
import { isPasswordCompliant, passwordRequirementsHint } from "@/lib/passwordPolicy";
import { useAuth } from "@/components/use-auth";
import { FieldError } from "@/components/form-field";
import { fieldProps, reportFieldErrors } from "@/lib/formField";

/** L'ordine in cui i campi stanno nella pagina: decide su quale si posa il focus. */
const fieldOrder = ["forceCurrentPassword", "forceNewPassword", "forceConfirmPassword"] as const;

type FieldId = (typeof fieldOrder)[number];
type FieldErrors = Partial<Record<FieldId, string>>;

const ForcePasswordChangePage = () => {
    useDocumentTitle("Cambio password");
    const { user, refresh, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        // Niente `state.from`: il prossimo login (magari di un altro utente) deve atterrare
        // sulla dashboard, non riaprire la pagina su cui ci si trovava prima di questo blocco.
        navigate("/login", { replace: true });
        void logout();
    };

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>({});

    const clearError = (field: FieldId) => setErrors((prev) => ({ ...prev, [field]: undefined }));

    const handleSubmit = async () => {
        if (isSubmitting) {
            return;
        }

        // Gli errori di validazione stanno sotto il campo, come nei dialoghi: un toast sparisce
        // da solo e non dice su quale campo intervenire.
        const nextErrors: FieldErrors = {};

        if (!currentPassword) {
            nextErrors.forceCurrentPassword = "Inserisci la password attuale";
        }

        if (!isPasswordCompliant(newPassword)) {
            nextErrors.forceNewPassword = passwordRequirementsHint;
        }

        if (!confirmPassword) {
            nextErrors.forceConfirmPassword = "Ripeti la nuova password";
        } else if (newPassword !== confirmPassword) {
            nextErrors.forceConfirmPassword = "Le due password inserite non coincidono";
        }

        if (reportFieldErrors(nextErrors, fieldOrder, setErrors)) {
            return;
        }

        try {
            setIsSubmitting(true);
            await changeOwnPassword({ currentPassword, newPassword });
            toast.success("Password aggiornata con successo");
            await refresh();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile aggiornare la password"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="flex h-svh w-full items-center justify-center px-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <ShieldAlert className="size-5" />
                    </div>
                    {/* Un h1 e non `CardTitle` (un div): è il titolo della pagina, e chi naviga per
                        intestazioni non ne trovava nessuno. Stesse classi di `CardTitle`. */}
                    <h1 data-slot="card-title" className="font-heading text-2xl leading-normal font-medium">
                        Imposta una nuova password
                    </h1>
                    <CardDescription>
                        {user ? `L'account "${user.username}" usa ancora una password generata automaticamente. ` : ""}
                        Per continuare devi impostarne una tua.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        className="grid gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void handleSubmit();
                        }}
                    >
                        {/* Il nome utente c'è ma non si vede: senza, il gestore di password non sa a
                            quale voce salvata riferire il cambio e può aggiornare quella sbagliata. */}
                        <input
                            type="text"
                            name="username"
                            autoComplete="username"
                            value={user?.username ?? ""}
                            readOnly
                            tabIndex={-1}
                            aria-hidden="true"
                            className="sr-only"
                        />

                        <div className="grid gap-2">
                            <Label htmlFor="forceCurrentPassword">Password attuale</Label>
                            <Input
                                {...fieldProps("forceCurrentPassword", { error: errors.forceCurrentPassword })}
                                type="password"
                                autoComplete="current-password"
                                autoFocus
                                value={currentPassword}
                                onChange={(event) => {
                                    setCurrentPassword(event.target.value);
                                    clearError("forceCurrentPassword");
                                }}
                            />
                            <FieldError id="forceCurrentPassword" error={errors.forceCurrentPassword} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="forceNewPassword">Nuova password</Label>
                            <div className="relative">
                                <Input
                                    {...fieldProps("forceNewPassword", { error: errors.forceNewPassword })}
                                    type={isPasswordVisible ? "text" : "password"}
                                    autoComplete="new-password"
                                    value={newPassword}
                                    onChange={(event) => {
                                        setNewPassword(event.target.value);
                                        clearError("forceNewPassword");
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
                            {/* Il suggerimento resta finché non c'è l'errore: l'errore dice lo stesso. */}
                            {errors.forceNewPassword ? (
                                <FieldError id="forceNewPassword" error={errors.forceNewPassword} />
                            ) : (
                                <p className="text-xs text-muted-foreground">{passwordRequirementsHint}</p>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="forceConfirmPassword">Conferma nuova password</Label>
                            <Input
                                {...fieldProps("forceConfirmPassword", { error: errors.forceConfirmPassword })}
                                type={isPasswordVisible ? "text" : "password"}
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(event) => {
                                    setConfirmPassword(event.target.value);
                                    clearError("forceConfirmPassword");
                                }}
                            />
                            <FieldError id="forceConfirmPassword" error={errors.forceConfirmPassword} />
                        </div>

                        <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
                            {isSubmitting ? "Salvataggio..." : "Imposta password e continua"}
                        </Button>

                        <Button type="button" variant="ghost" className="text-muted-foreground" onClick={handleLogout}>
                            Esci
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </main>
    );
};

export default ForcePasswordChangePage;
