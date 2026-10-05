import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, Database, FileDown, Mail, Palette, RefreshCw, ScrollText, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SettingsLoadingBox } from "@/components/settings/settingsUi";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/use-auth";

// Una sezione alla volta, caricata quando la si apre: chi entra in Impostazioni per cambiare
// il tema non deve scaricare backup, log, utenti e SMTP, e i non amministratori quelle
// sezioni non le vedono nemmeno. Prima erano tutte nello stesso pacchetto della pagina.
const ThemeSettingsSection = lazy(() => import("@/components/settings/themeSettingsSection"));
const SecuritySettingsSection = lazy(() => import("@/components/settings/securitySettingsSection"));
const UsersSettingsSection = lazy(() => import("@/components/settings/usersSettingsSection"));
const CompanySettingsPanel = lazy(() => import("@/components/settings/companySettingsPanel"));
const EmailSettingsPanel = lazy(() => import("@/components/settings/emailSettingsPanel"));
const ExportSettingsSection = lazy(() => import("@/components/settings/exportSettingsSection"));
const BackupSettingsPanel = lazy(() => import("@/components/settings/backupSettingsPanel"));
const UpdateSettingsPanel = lazy(() => import("@/components/settings/updateSettingsPanel"));
const LogsSettingsPanel = lazy(() => import("@/components/settings/logsSettingsPanel"));

type SettingsSectionKey =
    "theme" | "security" | "users" | "company" | "email" | "export" | "backup" | "update" | "logs";

const settingsSectionKeys: SettingsSectionKey[] = [
    "theme",
    "security",
    "users",
    "company",
    "email",
    "export",
    "backup",
    "update",
    "logs",
];

type SettingsGroupKey = "preferences" | "lab" | "system";

// Le categorie seguono chi decide cosa: le proprie preferenze, la configurazione del laboratorio,
// la macchina e i suoi dati. Una categoria senza voci apribili (per un non-admin) sparisce.
const settingsGroups: Array<{ key: SettingsGroupKey; label: string }> = [
    { key: "preferences", label: "Preferenze" },
    { key: "lab", label: "Laboratorio" },
    { key: "system", label: "Dati e sistema" },
];

const settingsSections: Array<{
    key: SettingsSectionKey;
    group: SettingsGroupKey;
    label: string;
    description: string;
    icon: typeof Palette;
}> = [
    {
        key: "theme",
        group: "preferences",
        label: "Tema",
        description: "Colori, modalità e accenti visivi",
        icon: Palette,
    },
    {
        key: "security",
        group: "preferences",
        label: "Sicurezza",
        description: "Verifica in due passaggi del tuo account",
        icon: ShieldCheck,
    },
    {
        key: "users",
        group: "lab",
        label: "Utenti",
        description: "Account che possono accedere all'app",
        icon: Users,
    },
    {
        key: "company",
        group: "lab",
        label: "Azienda",
        description: "Dati e logo del laboratorio su app e PDF",
        icon: Building2,
    },
    {
        key: "email",
        group: "lab",
        label: "Email",
        description: "Configurazione SMTP per l'invio email",
        icon: Mail,
    },
    {
        key: "export",
        group: "system",
        label: "Esportazione",
        description: "Scarica clienti e report in CSV",
        icon: FileDown,
    },
    {
        key: "backup",
        group: "system",
        label: "Backup",
        description: "Dump, archivio e ripristino",
        icon: Database,
    },
    {
        key: "update",
        group: "system",
        label: "Aggiornamenti",
        description: "Verifica e aggiorna l'applicazione",
        icon: RefreshCw,
    },
    {
        key: "logs",
        group: "system",
        label: "Log",
        description: "Registro delle azioni eseguite",
        icon: ScrollText,
    },
];

const isSettingsSectionKey = (value: string | null): value is SettingsSectionKey =>
    value != null && (settingsSectionKeys as string[]).includes(value);

// Il backend riserva all'amministratore tutto /api/settings tranne la lettura di dati
// azienda e stato del logo: sono operazioni sulla macchina (dump del database, log di
// tutti, credenziali NAS e SMTP, aggiornamento dello stack), non preferenze personali.
// Qui le sezioni corrispondenti vengono nascoste, perché a un non-admin risponderebbero
// solo 403. Al di fuori dell'amministratore resta il tema, che è una scelta di chi guarda.
const adminOnlySections = new Set<SettingsSectionKey>(["users", "company", "email", "backup", "update", "logs"]);

/** Dove si voleva andare quando è comparsa la domanda "Modifiche non salvate". */
type PendingLeave = { type: "section"; section: SettingsSectionKey } | { type: "link"; to: string };

/**
 * Il link interno su cui si è cliccato, se è una navigazione che questa pagina deve fermare:
 * clic sinistro senza tasti modificatori (Ctrl/⌘ o Maiusc aprono una scheda o una finestra
 * nuova, e le modifiche qui restano), stessa origine, nessun `target` o `download`. `null` per
 * tutto il resto, che il browser gestisce da sé.
 */
const getInternalLinkTarget = (event: MouseEvent) => {
    if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
    ) {
        return null;
    }

    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;

    if (!(anchor instanceof HTMLAnchorElement) || anchor.target || anchor.hasAttribute("download")) {
        return null;
    }

    const url = new URL(anchor.href, window.location.href);

    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : null;
};

/** Stesso aspetto delle card delle sezioni mentre arrivano i dati, finché arriva il codice. */
const SectionFallback = () => (
    <Card size="sm" className="border-primary/15 shadow-sm">
        <CardContent>
            <SettingsLoadingBox label="Caricamento sezione..." />
        </CardContent>
    </Card>
);

const SettingsPage = () => {
    useDocumentTitle("Impostazioni");
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const sectionFromUrl = searchParams.get("section");
    const canOpenSection = (section: SettingsSectionKey) => !adminOnlySections.has(section) || Boolean(user?.isAdmin);
    const activeSection: SettingsSectionKey =
        isSettingsSectionKey(sectionFromUrl) && canOpenSection(sectionFromUrl) ? sectionFromUrl : "theme";
    const visibleSettingsSections = settingsSections.filter((section) => canOpenSection(section.key));
    const visibleSettingsGroups = settingsGroups
        .map((group) => ({
            ...group,
            sections: visibleSettingsSections.filter((section) => section.group === group.key),
        }))
        .filter((group) => group.sections.length > 0);
    const navigate = useNavigate();
    const location = useLocation();

    // Azienda, Email e Backup si salvano con un pulsante: finché il modulo è diverso da quanto
    // salvato, la sezione lo dice qui. Prima quello stato serviva solo ad abilitare "Salva", e
    // cambiare sezione, toccare una voce della barra laterale o chiudere la scheda buttava via
    // le modifiche senza chiedere. Le altre sezioni applicano ogni scelta subito, o lavorano in
    // dialoghi che hanno già la loro domanda.
    const [isSectionDirty, setIsSectionDirty] = useState(false);
    const [pendingLeave, setPendingLeave] = useState<PendingLeave | null>(null);
    const keepEditingButtonRef = useRef<HTMLButtonElement>(null);
    // Letti dall'ascoltatore dei clic sul documento, registrato una volta sola.
    const isSectionDirtyRef = useRef(false);
    const currentUrlRef = useRef("");

    useEffect(() => {
        isSectionDirtyRef.current = isSectionDirty;
        currentUrlRef.current = `${location.pathname}${location.search}${location.hash}`;
    });

    const sectionContent: Record<SettingsSectionKey, ReactNode> = {
        theme: <ThemeSettingsSection />,
        security: <SecuritySettingsSection />,
        users: <UsersSettingsSection />,
        company: <CompanySettingsPanel onDirtyChange={setIsSectionDirty} />,
        email: <EmailSettingsPanel onDirtyChange={setIsSectionDirty} />,
        export: <ExportSettingsSection />,
        backup: <BackupSettingsPanel onDirtyChange={setIsSectionDirty} />,
        update: <UpdateSettingsPanel />,
        logs: <LogsSettingsPanel />,
    };

    // Chiudere o ricaricare la scheda: la domanda è quella nativa del browser, l'unica
    // ammessa in `beforeunload`.
    useEffect(() => {
        if (!isSectionDirty) {
            return;
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isSectionDirty]);

    // Le voci della barra laterale (e ogni altro link interno, compreso quello dell'elenco
    // delle scorciatoie) sono `<a>` di React Router: si fermano qui, in cattura sul documento,
    // prima che il loro `onClick` cambi pagina. L'app usa `BrowserRouter`, che non ha
    // `useBlocker` (ce l'hanno solo i router "data"): senza questo si sarebbe dovuto toccare
    // ogni link dell'app. Restano fuori il tasto Indietro del browser e i cambi di pagina
    // fatti in codice (la ricerca globale, l'uscita).
    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (!isSectionDirtyRef.current) {
                return;
            }

            const to = getInternalLinkTarget(event);

            if (to == null || to === currentUrlRef.current) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            setPendingLeave({ type: "link", to });
        };

        document.addEventListener("click", handleClick, true);
        return () => document.removeEventListener("click", handleClick, true);
    }, []);

    const showSection = (section: SettingsSectionKey) => {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.set("section", section);
                return next;
            },
            { replace: true }
        );
    };

    const setActiveSection = (section: SettingsSectionKey) => {
        if (section === activeSection) {
            return;
        }

        if (isSectionDirty) {
            setPendingLeave({ type: "section", section });
            return;
        }

        showSection(section);
    };

    const handleDiscard = () => {
        const leave = pendingLeave;
        setPendingLeave(null);
        // Subito, non allo smontaggio del pannello: il `navigate` qui sotto non deve essere
        // fermato di nuovo dall'ascoltatore dei clic.
        setIsSectionDirty(false);
        isSectionDirtyRef.current = false;

        if (leave?.type === "section") {
            showSection(leave.section);
        } else if (leave?.type === "link") {
            navigate(leave.to);
        }
    };

    // Il menu laterale (320px) compare solo da `xl`; sotto c'è il selettore a tendina. Prima il
    // cambio era a `sm`, ma la barra laterale dell'app resta aperta da `md` in su (scelta
    // dell'utente): fra 640 e ~1280px, tolti barra e menu, alla sezione restavano 250–600px e
    // le opzioni del tema si leggevano "Chiar", "Scur". La sezione è un `@container`, così le
    // griglie al suo interno si regolano sullo spazio che hanno davvero e non sulla finestra.
    return (
        <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto xl:flex-row xl:overflow-visible">
            {/* Le altre pagine hanno il titolo nel PageHeader; qui il titolo visibile è la voce
                attiva del menu, ma chi naviga per intestazioni deve comunque trovare un h1. */}
            <h1 className="sr-only">Impostazioni</h1>
            <Select value={activeSection} onValueChange={(value) => setActiveSection(value as SettingsSectionKey)}>
                <SelectTrigger className="w-full xl:hidden">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {visibleSettingsGroups.map((group) => (
                        <SelectGroup key={group.key}>
                            <SelectLabel>{group.label}</SelectLabel>
                            {group.sections.map((section) => {
                                const Icon = section.icon;

                                return (
                                    <SelectItem key={section.key} value={section.key}>
                                        <Icon className="size-4" />
                                        {section.label}
                                    </SelectItem>
                                );
                            })}
                        </SelectGroup>
                    ))}
                </SelectContent>
            </Select>

            {/* `self-start` e `max-h-full`: alto quanto le sue voci, non quanto la pagina. Stirato
                dal flex, per chi non è amministratore (due voci) era una card con ~600px vuoti. */}
            <nav
                aria-label="Sezioni delle impostazioni"
                className="hidden max-h-full w-56 shrink-0 self-start overflow-y-auto rounded-2xl border bg-card p-2 shadow-sm xl:block"
            >
                <div className="grid gap-3">
                    {visibleSettingsGroups.map((group) => (
                        <div
                            key={group.key}
                            role="group"
                            aria-labelledby={`settings-group-${group.key}`}
                            className="not-first:border-t not-first:pt-3"
                        >
                            <p
                                id={`settings-group-${group.key}`}
                                className="mb-1.5 px-3 text-xs font-bold tracking-wider text-foreground/60 uppercase"
                            >
                                {group.label}
                            </p>
                            <ul className="grid gap-0.5">
                                {group.sections.map((section) => {
                                    const Icon = section.icon;
                                    const isActive = activeSection === section.key;

                                    return (
                                        <li key={section.key}>
                                            <button
                                                type="button"
                                                title={section.description}
                                                aria-current={isActive ? "page" : undefined}
                                                onClick={() => setActiveSection(section.key)}
                                                className={cn(
                                                    "relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                                                    isActive &&
                                                        "bg-foreground/10 font-semibold text-foreground before:absolute before:top-2 before:bottom-2 before:left-0 before:w-1 before:rounded-full before:bg-primary hover:bg-foreground/10 hover:text-foreground"
                                                )}
                                            >
                                                <Icon className="size-4 shrink-0" />
                                                {section.label}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            </nav>

            {/* Niente bordo né sfondo attorno alla sezione: le card delle impostazioni stanno
                direttamente sulla pagina, come le DetailSection delle schede. Prima erano una
                scatola (sezione) nella scatola (card) nella scatola (riquadro). */}
            <section className="@container min-w-0 flex-1 overflow-y-auto">
                <Suspense fallback={<SectionFallback />}>{sectionContent[activeSection]}</Suspense>
            </section>

            {/* Stesse parole e stessa disposizione della domanda dei dialoghi (vedi
                `CustomDialog`): il pulsante pieno è quello sicuro, ed è lui ad avere il focus. */}
            <Dialog
                open={pendingLeave != null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingLeave(null);
                    }
                }}
            >
                <DialogContent
                    className="border! border-destructive! sm:max-w-lg"
                    showCloseButton={false}
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        keepEditingButtonRef.current?.focus();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold">Modifiche non salvate</DialogTitle>
                        <DialogDescription>
                            Se lasci questa sezione adesso, le modifiche che non hai salvato andranno perse.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-2">
                        <Button
                            type="button"
                            size="lg"
                            className="text-lg"
                            variant="destructive"
                            onClick={handleDiscard}
                        >
                            Chiudi senza salvare
                        </Button>
                        <Button
                            type="button"
                            size="lg"
                            className="text-lg"
                            ref={keepEditingButtonRef}
                            onClick={() => setPendingLeave(null)}
                        >
                            Continua a modificare
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default SettingsPage;
