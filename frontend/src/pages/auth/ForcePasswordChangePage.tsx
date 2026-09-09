import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { changeOwnPassword, getApiErrorMessage } from "@/lib/api";
import { isPasswordCompliant, passwordRequirementsHint } from "@/lib/passwordPolicy";
import { useAuth } from "@/components/use-auth";

const ForcePasswordChangePage = () => {
    useDocumentTitle("Cambio password");
    const { user, refresh, logout } = useAuth();

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (isSubmitting) {
            return;
        }

        if (!currentPassword) {
            toast.error("Inserisci la password attuale");
            return;
        }

        if (!isPasswordCompliant(newPassword)) {
            toast.error(passwordRequirementsHint);
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error("Le due password inserite non coincidono");
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
        <div className="flex h-svh w-full items-center justify-center px-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <ShieldAlert className="size-5" />
                    </div>
                    <CardTitle className="text-2xl">Imposta una nuova password</CardTitle>
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
                        <div className="grid gap-2">
                            <Label htmlFor="forceCurrentPassword">Password attuale</Label>
                            <Input
                                id="forceCurrentPassword"
                                type="password"
                                autoComplete="current-password"
                                autoFocus
                                value={currentPassword}
                                onChange={(event) => setCurrentPassword(event.target.value)}
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="forceNewPassword">Nuova password</Label>
                            <div className="relative">
                                <Input
                                    id="forceNewPassword"
                                    type={isPasswordVisible ? "text" : "password"}
                                    autoComplete="new-password"
                                    value={newPassword}
                                    onChange={(event) => setNewPassword(event.target.value)}
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
                            <p className="text-xs text-muted-foreground">{passwordRequirementsHint}</p>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="forceConfirmPassword">Conferma nuova password</Label>
                            <Input
                                id="forceConfirmPassword"
                                type={isPasswordVisible ? "text" : "password"}
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                            />
                        </div>

                        <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
                            {isSubmitting ? "Salvataggio..." : "Imposta password e continua"}
                        </Button>

                        <Button
                            type="button"
                            variant="ghost"
                            className="text-muted-foreground"
                            onClick={() => void logout()}
                        >
                            Esci
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default ForcePasswordChangePage;
