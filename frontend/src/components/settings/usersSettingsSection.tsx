import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";
import { Ellipsis, KeyRound, Monitor, ShieldCheck, ShieldOff, Trash2, UserPlus, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SettingsCard, SettingsLoadingBox, SettingsSection } from "@/components/settings/settingsUi";
import CustomDialog from "@/components/dialogs/customDialog";
import RefreshButton from "@/components/refresh-button";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import CreateUserDialog from "@/components/dialogs/settings/createUserDialog";
import GeneratedPasswordDialog from "@/components/dialogs/settings/generatedPasswordDialog";
import UserSessionsDialog from "@/components/dialogs/settings/userSessionsDialog";
import {
    deleteUser,
    disableUser,
    disableUserTwoFactor,
    enableUser,
    getApiErrorMessage,
    listUsers,
    regeneratePassword,
    type CreatedUserResult,
    type UserDto,
} from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { useAuth } from "@/components/use-auth";

const UsersSettingsSection = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<UserDto[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [generatedPasswordResult, setGeneratedPasswordResult] = useState<CreatedUserResult | null>(null);
    const [userPendingRegeneration, setUserPendingRegeneration] = useState<UserDto | null>(null);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [userPendingDisable, setUserPendingDisable] = useState<UserDto | null>(null);
    const [isTogglingActive, setIsTogglingActive] = useState(false);
    const [userPendingDelete, setUserPendingDelete] = useState<UserDto | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [userPendingTwoFactorReset, setUserPendingTwoFactorReset] = useState<UserDto | null>(null);
    const [isResettingTwoFactor, setIsResettingTwoFactor] = useState(false);
    const [twoFactorResetPassword, setTwoFactorResetPassword] = useState("");
    const [userViewingSessions, setUserViewingSessions] = useState<UserDto | null>(null);
    const isResettingOwnTwoFactor =
        userPendingTwoFactorReset != null && userPendingTwoFactorReset.id === currentUser?.id;

    const closeTwoFactorReset = () => {
        setUserPendingTwoFactorReset(null);
        setTwoFactorResetPassword("");
    };

    const loadUsers = async () => {
        setIsLoading(true);

        try {
            setUsers(await listUsers());
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare gli utenti"));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        startTransition(() => {
            void loadUsers();
        });
    }, []);

    const handleUserCreated = (result: CreatedUserResult) => {
        setUsers((prev) => [...prev, result.user].sort((a, b) => a.username.localeCompare(b.username)));
        setGeneratedPasswordResult(result);
        toast.success("Utente creato con successo");
    };

    const handleConfirmRegenerate = async () => {
        if (!userPendingRegeneration || isRegenerating) {
            return;
        }

        try {
            setIsRegenerating(true);
            const result = await regeneratePassword(userPendingRegeneration.id);
            setUserPendingRegeneration(null);
            setGeneratedPasswordResult(result);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile rigenerare la password"));
        } finally {
            setIsRegenerating(false);
        }
    };

    const handleConfirmDisable = async () => {
        if (!userPendingDisable || isTogglingActive) {
            return;
        }

        try {
            setIsTogglingActive(true);
            const updated = await disableUser(userPendingDisable.id);
            setUsers((prev) => prev.map((user) => (user.id === updated.id ? updated : user)));
            setUserPendingDisable(null);
            toast.success(`Account "${updated.username}" disabilitato`);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile disabilitare l'account"));
        } finally {
            setIsTogglingActive(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!userPendingDelete || isDeleting) {
            return;
        }

        try {
            setIsDeleting(true);
            await deleteUser(userPendingDelete.id);
            setUsers((prev) => prev.filter((user) => user.id !== userPendingDelete.id));
            toast.success(`Utente "${userPendingDelete.username}" eliminato`);
            setUserPendingDelete(null);
        } catch (error) {
            toast.error(
                getApiErrorMessage(error, "Impossibile eliminare l'account: disabilitalo se è ancora in uso altrove")
            );
        } finally {
            setIsDeleting(false);
        }
    };

    const handleEnable = async (user: UserDto) => {
        if (isTogglingActive) {
            return;
        }

        try {
            setIsTogglingActive(true);
            const updated = await enableUser(user.id);
            setUsers((prev) => prev.map((existing) => (existing.id === updated.id ? updated : existing)));
            toast.success(`Account "${updated.username}" riabilitato`);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile riabilitare l'account"));
        } finally {
            setIsTogglingActive(false);
        }
    };

    const handleConfirmTwoFactorReset = async () => {
        if (!userPendingTwoFactorReset || isResettingTwoFactor) {
            return;
        }

        if (isResettingOwnTwoFactor && !twoFactorResetPassword) {
            toast.error("Inserisci la tua password");
            return;
        }

        try {
            setIsResettingTwoFactor(true);
            const updated = await disableUserTwoFactor(
                userPendingTwoFactorReset.id,
                isResettingOwnTwoFactor ? twoFactorResetPassword : undefined
            );
            setUsers((prev) => prev.map((user) => (user.id === updated.id ? updated : user)));
            closeTwoFactorReset();
            toast.success(`Verifica in due passaggi disattivata per "${updated.username}"`);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile disattivare la verifica in due passaggi"));
        } finally {
            setIsResettingTwoFactor(false);
        }
    };

    // Quali azioni offrire su un utente: una regola sola per le schede su telefono (pulsanti)
    // e per la tabella (menu "⋯"), così le due viste non possono divergere.
    // - "Rigenera password" non sul proprio account: il backend lo rifiuta, perché consegnerebbe
    //   una password nuova senza chiedere quella attuale. Per sé c'è "Cambia password".
    // - "Disattiva 2FA" anche sul proprio account, a differenza di "disabilita" ed "elimina": è
    //   l'unico modo che un admin ha di rientrare dopo aver perso il telefono, senza mettere le
    //   mani sulla macchina. Su di sé il dialogo chiede la password.
    const getUserActions = (user: UserDto) => {
        const isSelf = user.id === currentUser?.id;

        return {
            canRegenerate: !isSelf,
            canResetTwoFactor: user.twoFactorEnabled,
            canToggleActive: !isSelf,
            canDelete: !isSelf,
        };
    };

    const renderUserActionButtons = (user: UserDto) => {
        const actions = getUserActions(user);

        return (
            <>
                <Button type="button" variant="outline" size="sm" onClick={() => setUserViewingSessions(user)}>
                    <Monitor className="size-4" />
                    Sessioni
                </Button>
                {actions.canRegenerate ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setUserPendingRegeneration(user)}>
                        <KeyRound className="size-4" />
                        Rigenera password
                    </Button>
                ) : null}
                {actions.canResetTwoFactor ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setUserPendingTwoFactorReset(user)}
                    >
                        <ShieldOff className="size-4" />
                        Disattiva 2FA
                    </Button>
                ) : null}
                {actions.canToggleActive ? (
                    user.active ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => setUserPendingDisable(user)}>
                            <UserX className="size-4" />
                            Disabilita
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isTogglingActive}
                            onClick={() => void handleEnable(user)}
                        >
                            <ShieldCheck className="size-4" />
                            Riabilita
                        </Button>
                    )
                ) : null}
                {actions.canDelete ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setUserPendingDelete(user)}>
                        <Trash2 className="size-4" />
                        Elimina
                    </Button>
                ) : null}
            </>
        );
    };

    /**
     * In tabella restano in riga solo "Sessioni", l'azione di consultazione, e un menu "⋯" per
     * le altre quattro. Con tutti i pulsanti affiancati la colonna Azioni sfondava la tabella
     * anche a 1440px ("Disat…", "Elimina" tagliato fuori), e sono comunque azioni rare, quasi
     * tutte confermate da un dialogo: un clic in più non pesa.
     */
    const renderUserActionsMenu = (user: UserDto) => {
        const actions = getUserActions(user);
        const hasMenuActions =
            actions.canRegenerate || actions.canResetTwoFactor || actions.canToggleActive || actions.canDelete;

        return (
            <>
                <Button type="button" variant="outline" size="sm" onClick={() => setUserViewingSessions(user)}>
                    <Monitor className="size-4" />
                    Sessioni
                </Button>
                {hasMenuActions ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                aria-label={`Altre azioni per ${user.username}`}
                            >
                                <Ellipsis className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        {/* `w-auto`: di serie il menu è largo quanto il trigger, qui un'icona da 32px. */}
                        <DropdownMenuContent align="end" className="w-auto min-w-48">
                            {actions.canRegenerate ? (
                                <DropdownMenuItem onSelect={() => setUserPendingRegeneration(user)}>
                                    <KeyRound />
                                    Rigenera password
                                </DropdownMenuItem>
                            ) : null}
                            {actions.canResetTwoFactor ? (
                                <DropdownMenuItem onSelect={() => setUserPendingTwoFactorReset(user)}>
                                    <ShieldOff />
                                    Disattiva 2FA
                                </DropdownMenuItem>
                            ) : null}
                            {actions.canToggleActive ? (
                                user.active ? (
                                    <DropdownMenuItem onSelect={() => setUserPendingDisable(user)}>
                                        <UserX />
                                        Disabilita
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem
                                        disabled={isTogglingActive}
                                        onSelect={() => void handleEnable(user)}
                                    >
                                        <ShieldCheck />
                                        Riabilita
                                    </DropdownMenuItem>
                                )
                            ) : null}
                            {actions.canDelete ? (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem variant="destructive" onSelect={() => setUserPendingDelete(user)}>
                                        <Trash2 />
                                        Elimina
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    // Tiene il posto del menu, così "Sessioni" resta incolonnato con le altre
                    // righe anche sul proprio account senza 2FA, che non ha altre azioni.
                    <span aria-hidden="true" className="size-8 shrink-0" />
                )}
            </>
        );
    };

    return (
        <SettingsSection>
            <SettingsCard
                title="Utenti"
                description="Gestisci gli account che possono accedere all'applicazione."
                action={
                    <>
                        <RefreshButton
                            size="icon"
                            onRefresh={loadUsers}
                            isRefreshing={isLoading}
                            label="Aggiorna elenco utenti"
                        />
                        <Button type="button" onClick={() => setIsCreateOpen(true)}>
                            <UserPlus className="size-4" />
                            Nuovo utente
                        </Button>
                    </>
                }
            >
                {isLoading ? (
                    <SettingsLoadingBox label="Caricamento utenti..." />
                ) : (
                    <>
                        <Table containerClassName="hidden sm:block">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome utente</TableHead>
                                    <TableHead>Creato il</TableHead>
                                    <TableHead className="text-right">Azioni</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((user) => (
                                    <TableRow key={user.id}>
                                        {/* Nome, contrassegni e data vanno a capo invece di stare su una
                                            riga sola: a 768px, con la barra laterale aperta, la tabella
                                            ha ~400px, e "claude_visual_check" più la data intera
                                            spingevano il menu delle azioni fuori dalla card. */}
                                        <TableCell className="font-medium [overflow-wrap:anywhere] whitespace-normal">
                                            {user.username}
                                            {user.id === currentUser?.id ? (
                                                <span className="ml-2 text-xs text-muted-foreground">(tu)</span>
                                            ) : null}
                                            {user.isAdmin ? (
                                                <span className="ml-2 text-xs text-muted-foreground">(admin)</span>
                                            ) : null}
                                            {!user.active ? (
                                                <span className="ml-2 text-xs text-destructive">(disabilitato)</span>
                                            ) : null}
                                            {user.twoFactorEnabled ? (
                                                <span className="ml-2 text-xs text-muted-foreground">(2FA)</span>
                                            ) : null}
                                        </TableCell>
                                        <TableCell className="whitespace-normal">
                                            {formatDateTime(user.createdAt)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {renderUserActionsMenu(user)}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <div className="flex flex-col gap-3 sm:hidden">
                            {users.map((user) => (
                                // Stesso aspetto delle schede di `EntityCardList`, che qui non si
                                // usa perché i pulsanti sono con testo e vanno a capo invece di
                                // dividersi la larghezza.
                                <article
                                    key={user.id}
                                    className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs"
                                >
                                    <div className="px-4 pt-3.5 pb-3.5">
                                        <h3 className="text-base leading-snug font-semibold break-words">
                                            {user.username}
                                        </h3>
                                        {user.id === currentUser?.id ||
                                        user.isAdmin ||
                                        !user.active ||
                                        user.twoFactorEnabled ? (
                                            <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-medium">
                                                {user.id === currentUser?.id ? (
                                                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                                                        tu
                                                    </span>
                                                ) : null}
                                                {user.isAdmin ? (
                                                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                                                        admin
                                                    </span>
                                                ) : null}
                                                {!user.active ? (
                                                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                                                        disabilitato
                                                    </span>
                                                ) : null}
                                                {user.twoFactorEnabled ? (
                                                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                                                        2FA
                                                    </span>
                                                ) : null}
                                            </div>
                                        ) : null}
                                        <dl className="mt-3">
                                            <dt className="text-xs text-muted-foreground">Creato il</dt>
                                            <dd className="mt-0.5 text-sm font-medium">
                                                {formatDateTime(user.createdAt)}
                                            </dd>
                                        </dl>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 border-t bg-muted/40 px-3 py-2.5">
                                        {renderUserActionButtons(user)}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </>
                )}
            </SettingsCard>

            <CreateUserDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} onCreated={handleUserCreated} />

            <CustomDialog
                open={userPendingRegeneration != null}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setUserPendingRegeneration(null);
                    }
                }}
                title="Rigenera password"
                description={
                    userPendingRegeneration
                        ? `Verrà generata una nuova password casuale per "${userPendingRegeneration.username}". La password attuale smetterà di funzionare.`
                        : undefined
                }
                confirmLabel={isRegenerating ? "Rigenerazione..." : "Rigenera"}
                confirmIcon={KeyRound}
                cancelLabel="Annulla"
                onCancel={() => setUserPendingRegeneration(null)}
                onConfirm={() => void handleConfirmRegenerate()}
                cancelDisabled={isRegenerating}
                confirmDisabled={isRegenerating}
            />

            <CustomDialog
                open={userPendingDisable != null}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setUserPendingDisable(null);
                    }
                }}
                title="Disabilita account"
                description={
                    userPendingDisable
                        ? `L'utente "${userPendingDisable.username}" non potrà più accedere all'applicazione finché non verrà riabilitato. Le sessioni aperte verranno terminate.`
                        : undefined
                }
                destructive
                confirmLabel={isTogglingActive ? "Disabilitazione..." : "Disabilita"}
                confirmIcon={UserX}
                cancelLabel="Annulla"
                onCancel={() => setUserPendingDisable(null)}
                onConfirm={() => void handleConfirmDisable()}
                cancelDisabled={isTogglingActive}
                confirmDisabled={isTogglingActive}
            />

            <ConfirmDeleteDialog
                open={userPendingDelete != null}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setUserPendingDelete(null);
                    }
                }}
                title="Elimina utente"
                description={
                    userPendingDelete
                        ? `L'account "${userPendingDelete.username}" verrà eliminato definitivamente. Se è ancora collegato a qualcosa nell'applicazione, disabilitalo invece di eliminarlo.`
                        : ""
                }
                isDeleting={isDeleting}
                onConfirm={handleConfirmDelete}
            />

            <CustomDialog
                open={userPendingTwoFactorReset != null}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        closeTwoFactorReset();
                    }
                }}
                title="Disattiva la verifica in due passaggi"
                description={
                    userPendingTwoFactorReset
                        ? isResettingOwnTwoFactor
                            ? "Potrai rientrare con la sola password, e i tuoi codici di recupero verranno cancellati. Tutte le sessioni aperte verranno terminate, compresa questa. Conferma con la tua password."
                            : `"${userPendingTwoFactorReset.username}" potrà rientrare con la sola password, e i suoi codici di recupero verranno cancellati. Le sessioni aperte verranno terminate. Fallo solo se ti ha chiesto lui di sbloccarlo.`
                        : undefined
                }
                content={
                    isResettingOwnTwoFactor ? (
                        <div className="grid gap-2 pb-2">
                            <Label htmlFor="ownTwoFactorResetPassword">Password</Label>
                            <Input
                                id="ownTwoFactorResetPassword"
                                type="password"
                                autoComplete="current-password"
                                value={twoFactorResetPassword}
                                onChange={(event) => setTwoFactorResetPassword(event.target.value)}
                            />
                        </div>
                    ) : undefined
                }
                destructive
                confirmLabel={isResettingTwoFactor ? "Disattivazione..." : "Disattiva"}
                confirmIcon={ShieldOff}
                cancelLabel="Annulla"
                onCancel={closeTwoFactorReset}
                onConfirm={() => void handleConfirmTwoFactorReset()}
                cancelDisabled={isResettingTwoFactor}
                confirmDisabled={isResettingTwoFactor}
            />

            <UserSessionsDialog
                open={userViewingSessions != null}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setUserViewingSessions(null);
                    }
                }}
                user={userViewingSessions}
            />

            {generatedPasswordResult ? (
                <GeneratedPasswordDialog
                    open
                    onOpenChange={(nextOpen) => {
                        if (!nextOpen) {
                            setGeneratedPasswordResult(null);
                        }
                    }}
                    username={generatedPasswordResult.user.username}
                    password={generatedPasswordResult.generatedPassword}
                />
            ) : null}
        </SettingsSection>
    );
};

export default UsersSettingsSection;
