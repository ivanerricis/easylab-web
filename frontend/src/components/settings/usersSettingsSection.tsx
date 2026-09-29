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
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SettingsCard, SettingsSection } from "@/components/settings/settingsUi";
import EntityCardList, { type EntityCardColumn } from "@/components/entity-card-list";
import FormField from "@/components/form-field";
import StatusBadge from "@/components/status-badge";
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
    getApiErrorStatus,
    listUsers,
    regeneratePassword,
    type CreatedUserResult,
    type UserDto,
} from "@/lib/api";
import { fieldProps } from "@/lib/formField";
import type { StatusColor } from "@/lib/statusColors";
import { cn, formatDateTime } from "@/lib/utils";
import { useAuth } from "@/components/use-auth";
import { settleDialogHistory } from "@/hooks/useDialogHistoryEntry";
import { usePendingAction } from "@/hooks/usePendingAction";

/** Rosso per un account disabilitato: tinta della riga in tabella, striscia della scheda. */
const getUserStatusColor = (user: UserDto): StatusColor | undefined => (user.active ? undefined : "red");

const ownTwoFactorResetPasswordId = "ownTwoFactorResetPassword";

const UsersSettingsSection = () => {
    const { user: currentUser, refresh } = useAuth();
    const [users, setUsers] = useState<UserDto[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [generatedPasswordResult, setGeneratedPasswordResult] = useState<CreatedUserResult | null>(null);
    const [isEnabling, setIsEnabling] = useState(false);
    const [twoFactorResetPassword, setTwoFactorResetPassword] = useState("");
    // Sotto il campo e non in un toast, come nella pagina di accesso: anche il rifiuto del server
    // per password sbagliata, che è l'errore più probabile qui e riguarda proprio quel campo.
    const [twoFactorResetPasswordError, setTwoFactorResetPasswordError] = useState<string>();
    const [userViewingSessions, setUserViewingSessions] = useState<UserDto | null>(null);

    const clearTwoFactorResetPassword = () => {
        setTwoFactorResetPassword("");
        setTwoFactorResetPasswordError(undefined);
    };

    const regenerateAction = usePendingAction({
        run: (user: UserDto) => regeneratePassword(user.id),
        // Niente avviso: la password nuova compare nel suo dialogo, che è già l'esito.
        errorMessage: "Impossibile rigenerare la password",
        onDone: (_, result) => setGeneratedPasswordResult(result),
    });
    const disableAction = usePendingAction({
        run: (user: UserDto) => disableUser(user.id),
        successMessage: (_, updated) => `Account "${updated.username}" disabilitato`,
        errorMessage: "Impossibile disabilitare l'account",
        onDone: (_, updated) => setUsers((prev) => prev.map((user) => (user.id === updated.id ? updated : user))),
    });
    // Disabilitare (dal dialogo) e riabilitare (dal menu, senza conferma) si escludono a vicenda,
    // come quando avevano un solo stato "in corso": finché l'una lavora, l'altra resta spenta.
    const isTogglingActive = isEnabling || disableAction.isRunning;
    const deleteAction = usePendingAction({
        run: (user: UserDto) => deleteUser(user.id),
        successMessage: (user) => `Utente "${user.username}" eliminato`,
        errorMessage: "Impossibile eliminare l'account: disabilitalo se è ancora in uso altrove",
        onDone: (deleted) => setUsers((prev) => prev.filter((user) => user.id !== deleted.id)),
    });
    const isSelf = (user: UserDto) => user.id === currentUser?.id;
    const twoFactorResetAction = usePendingAction({
        run: (user: UserDto) => disableUserTwoFactor(user.id, isSelf(user) ? twoFactorResetPassword : undefined),
        successMessage: (user, updated) =>
            isSelf(user)
                ? "Verifica in due passaggi disattivata. Accedi di nuovo con la tua password."
                : `Verifica in due passaggi disattivata per "${updated.username}"`,
        errorMessage: "Impossibile disattivare la verifica in due passaggi",
        onDone: async (user, updated) => {
            clearTwoFactorResetPassword();

            // Sul proprio account il backend ha appena chiuso tutte le sessioni, compresa questa
            // (vedi `adminDisableTwoFactor`): la pagina resterebbe aperta su una sessione che non
            // esiste più, e la prima azione successiva finirebbe al login senza spiegazioni.
            // `refresh` chiede di nuovo chi è l'utente, riceve 401 e `RequireAuth` porta subito
            // al login; il messaggio dice perché.
            if (isSelf(user)) {
                // Prima si consuma la voce di cronologia del dialogo appena chiuso: il login arriva
                // con un `replace`, che altrimenti potrebbe sostituire quella voce invece della
                // pagina, e il `back()` del dialogo tornerebbe poi fuori posto.
                await settleDialogHistory();
                await refresh();
                return;
            }

            setUsers((prev) => prev.map((existing) => (existing.id === updated.id ? updated : existing)));
        },
        onError: (message, error, user) => {
            // Sul proprio account un 400 è la password rifiutata (vedi `assertOwnPassword` nel
            // backend): va sotto il campo. Gli altri errori (rete, permessi) non sono del campo.
            if (isSelf(user) && getApiErrorStatus(error) === 400) {
                setTwoFactorResetPasswordError(message);
                document.getElementById(ownTwoFactorResetPasswordId)?.focus();
            } else {
                toast.error(message);
            }
        },
    });
    const userPendingTwoFactorReset = twoFactorResetAction.pending;
    const isResettingOwnTwoFactor = userPendingTwoFactorReset != null && isSelf(userPendingTwoFactorReset);

    const closeTwoFactorReset = () => {
        twoFactorResetAction.close();
        clearTwoFactorResetPassword();
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

    const handleEnable = async (user: UserDto) => {
        if (isTogglingActive) {
            return;
        }

        try {
            setIsEnabling(true);
            const updated = await enableUser(user.id);
            setUsers((prev) => prev.map((existing) => (existing.id === updated.id ? updated : existing)));
            toast.success(`Account "${updated.username}" riabilitato`);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile riabilitare l'account"));
        } finally {
            setIsEnabling(false);
        }
    };

    // A campo vuoto non si parte nemmeno: l'errore va sotto il campo, senza chiamare il server.
    const handleConfirmTwoFactorReset = () => {
        if (isResettingOwnTwoFactor && !twoFactorResetPassword) {
            setTwoFactorResetPasswordError("Inserisci la tua password");
            document.getElementById(ownTwoFactorResetPasswordId)?.focus();
            return;
        }

        void twoFactorResetAction.confirm();
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

    /**
     * I contrassegni dell'utente, uguali in tabella e nella scheda. In tabella erano testo tra
     * parentesi ("(tu) (admin) (2FA)") e nella scheda pillole: la stessa informazione in due
     * forme, e le parentesi accanto al nome si leggevano come parte di esso. Sono `StatusBadge`,
     * la pillola degli stati delle liste: neutri, tranne "disabilitato" in rosso come la striscia
     * della scheda e la tinta della riga.
     */
    const renderUserFlags = (user: UserDto) => {
        const flags: { label: string; color?: StatusColor }[] = [
            user.id === currentUser?.id ? { label: "tu" } : null,
            user.isAdmin ? { label: "admin" } : null,
            !user.active ? { label: "disabilitato", color: "red" as const } : null,
            user.twoFactorEnabled ? { label: "2FA" } : null,
        ].filter((flag) => flag !== null);

        if (flags.length === 0) {
            return null;
        }

        return (
            <span className="flex flex-wrap gap-1.5">
                {flags.map((flag) => (
                    <StatusBadge key={flag.label} color={flag.color}>
                        {flag.label}
                    </StatusBadge>
                ))}
            </span>
        );
    };

    /** Nome e contrassegni insieme: il titolo della scheda e la prima cella della tabella. */
    const renderUserTitle = (user: UserDto) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {user.username}
            {renderUserFlags(user)}
        </span>
    );

    /**
     * Restano in riga solo "Sessioni", l'azione di consultazione, e un menu "⋯" per le altre
     * quattro, in tabella e nella scheda su telefono. Con tutti i pulsanti affiancati la colonna Azioni sfondava la tabella
     * anche a 1440px ("Disat…", "Elimina" tagliato fuori), e sono comunque azioni rare, quasi
     * tutte confermate da un dialogo: un clic in più non pesa. Nella scheda erano invece tutti
     * in vista, e a capo in righe diverse per ogni utente ("Sessioni" da solo, poi "Rigenera
     * password", poi "Disabilita" ed "Elimina"): due utenti non si somigliavano più.
     *
     * `inCard`: nella scheda i due pulsanti si dividono la fascia in fondo (`EntityCardList`), e
     * il segnaposto del menu che manca lascerebbe mezza fascia vuota invece di incolonnare.
     */
    const renderUserActionsMenu = (user: UserDto, inCard = false) => {
        const actions = getUserActions(user);
        const hasMenuActions =
            actions.canRegenerate || actions.canResetTwoFactor || actions.canToggleActive || actions.canDelete;

        return (
            <>
                <Button type="button" variant="outline" onClick={() => setUserViewingSessions(user)}>
                    <Monitor className="size-4" />
                    Sessioni
                </Button>
                {hasMenuActions ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label={`Altre azioni per ${user.username}`}
                            >
                                <Ellipsis className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        {/* `w-auto`: di serie il menu è largo quanto il trigger, qui un'icona da 36px. */}
                        <DropdownMenuContent align="end" className="w-auto min-w-48">
                            {actions.canRegenerate ? (
                                <DropdownMenuItem onSelect={() => regenerateAction.open(user)}>
                                    <KeyRound />
                                    Rigenera password
                                </DropdownMenuItem>
                            ) : null}
                            {actions.canResetTwoFactor ? (
                                <DropdownMenuItem onSelect={() => twoFactorResetAction.open(user)}>
                                    <ShieldOff />
                                    Disattiva 2FA
                                </DropdownMenuItem>
                            ) : null}
                            {actions.canToggleActive ? (
                                user.active ? (
                                    <DropdownMenuItem onSelect={() => disableAction.open(user)}>
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
                                    <DropdownMenuItem variant="destructive" onSelect={() => deleteAction.open(user)}>
                                        <Trash2 />
                                        Elimina
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : inCard ? null : (
                    // Tiene il posto del menu, così "Sessioni" resta incolonnato con le altre
                    // righe anche sul proprio account senza 2FA, che non ha altre azioni.
                    <span aria-hidden="true" className="size-9 shrink-0" />
                )}
            </>
        );
    };

    /**
     * Le schede sono quelle di `EntityCardList`, come nelle altre liste: striscia rossa per gli
     * account disabilitati e fascia dei pulsanti larga quanto la scheda, con bersagli da 44px.
     * `EntityTable` invece no: passa alla tabella a `sm` dello schermo, mentre qui conta la
     * larghezza della sezione (vedi sotto), e le sue colonne ridimensionabili con le larghezze
     * salvate non servono a tre colonne.
     */
    const userCardColumns: EntityCardColumn<UserDto>[] = [
        { key: "username", header: "Nome utente", render: renderUserTitle, cardSlot: "title" },
        { key: "createdAt", header: "Creato il", render: (user) => formatDateTime(user.createdAt) },
    ];
    const isInitialLoading = isLoading && users.length === 0;
    const refetchingClassName = isLoading && !isInitialLoading ? "opacity-60 transition-opacity" : undefined;

    return (
        <SettingsSection>
            {/* "Account" e non "Utenti": era il nome della sezione, ripetuto subito sotto. */}
            <SettingsCard
                title="Account"
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
                {/* Tabella e schede si scambiano sulla larghezza della sezione (`@container` in
                    SettingsPage), non dello schermo, come nei Log: a 768px con la barra laterale
                    aperta la sezione è larga circa 440px, e con `sm:` la tabella c'era già, con
                    nome, contrassegni e data che spingevano il menu delle azioni contro il bordo. */}
                <Table containerClassName="hidden @xl:block" aria-busy={isLoading} className={refetchingClassName}>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome utente</TableHead>
                            <TableHead>Creato il</TableHead>
                            <TableHead className="text-right">Azioni</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {/* Righe-scheletro come in EntityTable, solo al primo caricamento: a una
                            ricarica le righe restano leggibili, appena attenuate. */}
                        {isInitialLoading
                            ? Array.from({ length: 3 }, (_, rowIndex) => (
                                  <TableRow key={`skeleton-${rowIndex}`} aria-hidden={rowIndex > 0}>
                                      <TableCell>
                                          {rowIndex === 0 ? (
                                              <span className="sr-only">Caricamento utenti...</span>
                                          ) : null}
                                          <Skeleton aria-hidden="true" className="h-4 w-full" />
                                      </TableCell>
                                      <TableCell>
                                          <Skeleton aria-hidden="true" className="h-4 w-full" />
                                      </TableCell>
                                      <TableCell>
                                          <Skeleton aria-hidden="true" className="ml-auto h-9 w-36" />
                                      </TableCell>
                                  </TableRow>
                              ))
                            : users.map((user) => (
                                  // Tinta rossa per gli account disabilitati, come la striscia della
                                  // scheda: lo stesso `data-status-color` di EntityTable (index.css).
                                  <TableRow key={user.id} data-status-color={getUserStatusColor(user)}>
                                      {/* Nome, contrassegni e data vanno a capo invece di stare su una
                                          riga sola: in una sezione stretta "claude_visual_check" più la
                                          data intera spingevano il menu delle azioni fuori dalla card. */}
                                      <TableCell className="font-medium [overflow-wrap:anywhere] whitespace-normal">
                                          {renderUserTitle(user)}
                                      </TableCell>
                                      <TableCell className="whitespace-normal">
                                          {formatDateTime(user.createdAt)}
                                      </TableCell>
                                      {/* Colori neutri nella cella delle azioni, come in EntityTable:
                                          la tinta della riga non deve colorare i pulsanti. */}
                                      <TableCell
                                          className={cn("text-right", !user.active && "bg-card text-foreground")}
                                      >
                                          <div className="flex items-center justify-end gap-2">
                                              {renderUserActionsMenu(user)}
                                          </div>
                                      </TableCell>
                                  </TableRow>
                              ))}
                    </TableBody>
                </Table>

                <EntityCardList
                    hiddenFromClassName="@xl:hidden"
                    className={refetchingClassName}
                    columns={userCardColumns}
                    rows={users}
                    getRowKey={(user) => user.id}
                    getStatusColor={getUserStatusColor}
                    renderActions={(user) => renderUserActionsMenu(user, true)}
                    emptyMessage="Nessun utente."
                    isInitialLoading={isInitialLoading}
                    skeletonCardCount={2}
                />
            </SettingsCard>

            <CreateUserDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} onCreated={handleUserCreated} />

            <CustomDialog
                open={regenerateAction.isOpen}
                onOpenChange={regenerateAction.onOpenChange}
                title="Rigenera password"
                description={
                    regenerateAction.pending
                        ? `Verrà generata una nuova password casuale per "${regenerateAction.pending.username}". La password attuale smetterà di funzionare.`
                        : undefined
                }
                confirmLabel={regenerateAction.isRunning ? "Rigenerazione..." : "Rigenera"}
                confirmIcon={KeyRound}
                cancelLabel="Annulla"
                onCancel={regenerateAction.close}
                onConfirm={() => void regenerateAction.confirm()}
                cancelDisabled={regenerateAction.isRunning}
                confirmDisabled={regenerateAction.isRunning}
            />

            <CustomDialog
                open={disableAction.isOpen}
                onOpenChange={disableAction.onOpenChange}
                title="Disabilita account"
                description={
                    disableAction.pending
                        ? `L'utente "${disableAction.pending.username}" non potrà più accedere all'applicazione finché non verrà riabilitato. Le sessioni aperte verranno terminate.`
                        : undefined
                }
                destructive
                confirmLabel={isTogglingActive ? "Disabilitazione..." : "Disabilita"}
                confirmIcon={UserX}
                cancelLabel="Annulla"
                onCancel={disableAction.close}
                onConfirm={() => void disableAction.confirm()}
                cancelDisabled={isTogglingActive}
                confirmDisabled={isTogglingActive}
            />

            <ConfirmDeleteDialog
                open={deleteAction.isOpen}
                onOpenChange={deleteAction.onOpenChange}
                title="Elimina utente"
                description={
                    deleteAction.pending
                        ? `L'account "${deleteAction.pending.username}" verrà eliminato definitivamente. Se è ancora collegato a qualcosa nell'applicazione, disabilitalo invece di eliminarlo.`
                        : ""
                }
                isDeleting={deleteAction.isRunning}
                onConfirm={deleteAction.confirm}
            />

            <CustomDialog
                open={twoFactorResetAction.isOpen}
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
                        <FormField
                            id={ownTwoFactorResetPasswordId}
                            label="Password"
                            required
                            error={twoFactorResetPasswordError}
                            className="pb-2"
                        >
                            <Input
                                {...fieldProps(ownTwoFactorResetPasswordId, {
                                    error: twoFactorResetPasswordError,
                                    required: true,
                                })}
                                type="password"
                                autoComplete="current-password"
                                value={twoFactorResetPassword}
                                onChange={(event) => {
                                    setTwoFactorResetPassword(event.target.value);
                                    setTwoFactorResetPasswordError(undefined);
                                }}
                            />
                        </FormField>
                    ) : undefined
                }
                isDirty={twoFactorResetPassword !== ""}
                destructive
                confirmLabel={twoFactorResetAction.isRunning ? "Disattivazione..." : "Disattiva"}
                confirmIcon={ShieldOff}
                cancelLabel="Annulla"
                onCancel={closeTwoFactorReset}
                onConfirm={handleConfirmTwoFactorReset}
                cancelDisabled={twoFactorResetAction.isRunning}
                confirmDisabled={twoFactorResetAction.isRunning}
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
