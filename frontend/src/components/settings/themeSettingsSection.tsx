import { useEffect, useState } from "react";
import { Computer, Moon, RotateCcw, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SettingsCard, SettingsGroup, SettingsSection } from "@/components/settings/settingsUi";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useTheme } from "@/components/use-theme";
import { interventionStatusColor, interventionStatusOptions } from "@/lib/interventions";
import {
    applyPreference,
    cornerRadiusPresets,
    fontSizes,
    getStoredKeyboardShortcutsEnabled,
    getStoredPreference,
    setStoredKeyboardShortcutsEnabled,
    setStoredPreference,
    tableDensities,
    tableRowIntensities,
    themeAccentPresets,
    type AppearancePreferenceName,
    type FontSizeKey,
    type TableDensityKey,
    type TableRowIntensityKey,
} from "@/lib/theme";
import { cn, modifierKey } from "@/lib/utils";

type ModeOption = {
    value: "light" | "dark" | "system";
    label: string;
    description: string;
    icon: typeof Sun;
};

/**
 * Le tre righe d'anteprima riusano gli stati e i colori degli interventi (`lib/interventions.ts`)
 * invece di riscriverli: erano una copia identica, e una modifica a colori o etichette lì non
 * si sarebbe vista qui.
 */
const rowIntensityPreviewRows = interventionStatusOptions.map((option) => ({
    statusColor: interventionStatusColor[option.value],
    label: option.label,
}));

const modeOptions: ModeOption[] = [
    { value: "light", label: "Chiaro", description: "Interfaccia luminosa e pulita.", icon: Sun },
    { value: "dark", label: "Scuro", description: "Interfaccia più riposante.", icon: Moon },
    { value: "system", label: "Sistema", description: "Segue le impostazioni del sistema.", icon: Computer },
];

// Stessa resa dei pulsanti di navigazione della pagina Impostazioni: riquadro con icona,
// titolo e descrizione, bordo evidenziato quando la voce è quella attiva.
const optionButtonClasses = (isActive: boolean) =>
    cn(
        "h-auto items-start justify-start gap-2 rounded-xl border p-3 text-left whitespace-normal",
        isActive && "border-primary bg-primary/10 dark:border-primary dark:bg-primary/10"
    );

// In poco spazio ogni riquadro mostra solo icona e titolo: la riga più chiara che spiega la
// scelta (es. "Interfaccia luminosa e pulita.") si vede già dall'icona e dall'etichetta, ed è
// lei a far crescere ogni pulsante più del necessario sui telefoni.
//
// Le soglie di questa sezione (`@md`, `@lg`, `@2xl`) sono del contenitore, non della finestra:
// la pagina Impostazioni fa della sezione un `@container`. Con i breakpoint di finestra, fra
// 640 e ~1280px con la barra laterale aperta le griglie andavano a tre colonne in 250–400px e
// le etichette si leggevano "Chiar", "Scur". A tre colonne si passa da 512px di sezione.
const optionDescriptionClasses = "hidden text-xs font-normal text-muted-foreground @md:block";

// Le barrette prendono i colori dalle variabili del livello: l'attributo qui sopra le
// isola dall'intensità attiva, così ogni pulsante mostra davvero il proprio livello.
const IntensityPreview = ({ intensityKey }: { intensityKey: TableRowIntensityKey }) => (
    <span
        data-table-row-intensity={intensityKey}
        className="mt-0.5 flex shrink-0 flex-col gap-px overflow-hidden rounded-sm border border-border"
    >
        {(["red", "yellow", "green"] as const).map((color) => (
            <span
                key={color}
                className="h-1.5 w-4"
                style={{
                    background: `linear-gradient(to right, var(--table-row-id-${color}, transparent) 5px, var(--table-row-${color}) 5px)`,
                }}
            />
        ))}
    </span>
);

const densityPreviewGaps: Record<TableDensityKey, string> = {
    compact: "gap-0.5",
    default: "gap-1",
    comfortable: "gap-1.5",
};

const DensityPreview = ({ densityKey }: { densityKey: TableDensityKey }) => (
    <span className={cn("mt-0.5 flex shrink-0 flex-col overflow-hidden rounded-sm", densityPreviewGaps[densityKey])}>
        <span className="h-1.5 w-4 rounded-[1px] bg-muted-foreground/40" />
        <span className="h-1.5 w-4 rounded-[1px] bg-muted-foreground/40" />
        <span className="h-1.5 w-4 rounded-[1px] bg-muted-foreground/40" />
    </span>
);

const RadiusPreview = ({ radius }: { radius: string }) => (
    <span className="mt-0.5 size-4 shrink-0 border-2 border-muted-foreground/40" style={{ borderRadius: radius }} />
);

const fontSizePreviewClasses: Record<FontSizeKey, string> = {
    sm: "text-xs",
    default: "text-sm",
    lg: "text-base",
};

const FontSizePreview = ({ fontSizeKey }: { fontSizeKey: FontSizeKey }) => (
    <span className={cn("mt-0.5 shrink-0 leading-none font-semibold", fontSizePreviewClasses[fontSizeKey])}>Aa</span>
);

const ThemeSettingsSection = () => {
    const { theme, setTheme } = useTheme();
    const [selected, setSelected] = useState(() => ({
        accent: getStoredPreference("accent") ?? "default",
        rowIntensity: getStoredPreference("rowIntensity") ?? "default",
        density: getStoredPreference("density") ?? "default",
        fontSize: getStoredPreference("fontSize") ?? "default",
        radius: getStoredPreference("radius") ?? "default",
    }));
    const [shortcutsEnabled, setShortcutsEnabled] = useState(getStoredKeyboardShortcutsEnabled);

    useEffect(() => {
        applyPreference("accent", selected.accent);
    }, [selected.accent]);

    const handleSelect = <Name extends AppearancePreferenceName>(name: Name, value: (typeof selected)[Name]) => {
        setSelected((current) => ({ ...current, [name]: value }));
        setStoredPreference(name, value);
        applyPreference(name, value);
    };

    const handleToggleShortcuts = (enabled: boolean) => {
        setShortcutsEnabled(enabled);
        setStoredKeyboardShortcutsEnabled(enabled);
    };

    // Non tocca la modalità chiara/scura/sistema: è una scelta a sé, non una delle cinque
    // personalizzazioni d'aspetto qui sotto.
    const handleResetDefaults = () => {
        handleSelect("accent", "default");
        handleSelect("radius", "default");
        handleSelect("rowIntensity", "default");
        handleSelect("density", "default");
        handleSelect("fontSize", "default");
        toast.success("Aspetto ripristinato ai valori predefiniti");
    };

    return (
        <SettingsSection>
            <SettingsCard
                title="Modalità"
                description="Scegli se seguire il sistema oppure forzare il tema chiaro o scuro."
            >
                <div className="grid gap-2 @lg:grid-cols-3">
                    {modeOptions.map((option) => {
                        const Icon = option.icon;

                        return (
                            <Button
                                key={option.value}
                                type="button"
                                variant="outline"
                                className={optionButtonClasses(theme === option.value)}
                                onClick={() => setTheme(option.value)}
                            >
                                <Icon className="mt-0.5 size-4 shrink-0" />
                                <span className="grid gap-0.5">
                                    <span className="text-sm font-semibold">{option.label}</span>
                                    <span className={optionDescriptionClasses}>{option.description}</span>
                                </span>
                            </Button>
                        );
                    })}
                </div>
            </SettingsCard>

            <SettingsCard
                title="Colore principale"
                description="Palette usata per pulsanti, sidebar e accenti dell'applicazione."
            >
                <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3">
                    {themeAccentPresets.map((preset) => (
                        <Button
                            key={preset.key}
                            type="button"
                            variant="outline"
                            className={optionButtonClasses(selected.accent === preset.key)}
                            onClick={() => handleSelect("accent", preset.key)}
                        >
                            <span
                                className="mt-0.5 size-4 shrink-0 rounded-full border border-border"
                                style={{ backgroundColor: preset.primary }}
                            />
                            <span className="grid gap-0.5">
                                <span className="text-sm font-semibold">{preset.label}</span>
                                <span className={optionDescriptionClasses}>{preset.description}</span>
                            </span>
                        </Button>
                    ))}
                </div>
            </SettingsCard>

            <SettingsCard
                title="Raggio degli angoli"
                description="Quanto sono arrotondati i bordi di card, pulsanti e campi."
            >
                <div className="grid gap-2 @lg:grid-cols-3">
                    {cornerRadiusPresets.map((preset) => (
                        <Button
                            key={preset.key}
                            type="button"
                            variant="outline"
                            className={optionButtonClasses(selected.radius === preset.key)}
                            onClick={() => handleSelect("radius", preset.key)}
                        >
                            <RadiusPreview radius={preset.radius} />
                            <span className="grid gap-0.5">
                                <span className="text-sm font-semibold">{preset.label}</span>
                                <span className={optionDescriptionClasses}>{preset.description}</span>
                            </span>
                        </Button>
                    ))}
                </div>
            </SettingsCard>

            <SettingsCard
                title="Righe delle tabelle"
                description="Quanto sono marcati i colori di stato nelle tabelle di interventi e report."
            >
                <div className="grid gap-2 @lg:grid-cols-3">
                    {tableRowIntensities.map((intensity) => (
                        <Button
                            key={intensity.key}
                            type="button"
                            variant="outline"
                            className={optionButtonClasses(selected.rowIntensity === intensity.key)}
                            onClick={() => handleSelect("rowIntensity", intensity.key)}
                        >
                            <IntensityPreview intensityKey={intensity.key} />
                            <span className="grid gap-0.5">
                                <span className="text-sm font-semibold">{intensity.label}</span>
                                <span className={optionDescriptionClasses}>{intensity.description}</span>
                            </span>
                        </Button>
                    ))}
                </div>

                <SettingsGroup title="Anteprima" description="Le righe qui sotto usano il livello selezionato.">
                    <Table className="bg-card">
                        <TableBody>
                            {rowIntensityPreviewRows.map((previewRow, index) => (
                                <TableRow key={previewRow.statusColor} data-status-color={previewRow.statusColor}>
                                    {/* Due celle, come in una tabella vera: nello stile "Cella ID" si colora
                                        solo la prima, e con una cella sola si colorerebbe tutta la riga. */}
                                    <TableCell className="w-16">{index + 1}</TableCell>
                                    <TableCell>{previewRow.label}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </SettingsGroup>
            </SettingsCard>

            <SettingsCard
                title="Densità tabelle"
                description="Quanto sono ravvicinate le righe nelle tabelle dell'app."
            >
                <div className="grid gap-2 @lg:grid-cols-3">
                    {tableDensities.map((density) => (
                        <Button
                            key={density.key}
                            type="button"
                            variant="outline"
                            className={optionButtonClasses(selected.density === density.key)}
                            onClick={() => handleSelect("density", density.key)}
                        >
                            <DensityPreview densityKey={density.key} />
                            <span className="grid gap-0.5">
                                <span className="text-sm font-semibold">{density.label}</span>
                                <span className={optionDescriptionClasses}>{density.description}</span>
                            </span>
                        </Button>
                    ))}
                </div>
            </SettingsCard>

            <SettingsCard title="Dimensione testo" description="Scala il testo e gli elementi di tutta l'applicazione.">
                <div className="grid gap-2 @lg:grid-cols-3">
                    {fontSizes.map((fontSize) => (
                        <Button
                            key={fontSize.key}
                            type="button"
                            variant="outline"
                            className={optionButtonClasses(selected.fontSize === fontSize.key)}
                            onClick={() => handleSelect("fontSize", fontSize.key)}
                        >
                            <FontSizePreview fontSizeKey={fontSize.key} />
                            <span className="grid gap-0.5">
                                <span className="text-sm font-semibold">{fontSize.label}</span>
                                <span className={optionDescriptionClasses}>{fontSize.description}</span>
                            </span>
                        </Button>
                    ))}
                </div>
            </SettingsCard>

            {/* Non è aspetto, ma è una preferenza di questo browser come le altre della sezione, e
                non tocca nessun altro utente. Fuori da "Valori predefiniti": quello azzera l'aspetto. */}
            <SettingsCard
                title="Scorciatoie da tastiera"
                description="Tasti singoli come / per cercare e n per creare. Premi ? per l'elenco completo."
                keepDescriptionOnMobile
            >
                <div className="flex items-start gap-3">
                    <Checkbox
                        id="keyboardShortcutsEnabled"
                        checked={shortcutsEnabled}
                        onCheckedChange={(checked) => handleToggleShortcuts(checked === true)}
                    />
                    <Label htmlFor="keyboardShortcutsEnabled" className="cursor-pointer leading-snug">
                        Attiva le scorciatoie a un tasto
                    </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                    Spegnile se scattano per sbaglio, per esempio con un lettore di schermo o con i comandi vocali.{" "}
                    {modifierKey}+K per la ricerca e i tasti delle finestre restano sempre attivi.
                </p>
            </SettingsCard>

            {/* Il ripristino ha una card sua, in fondo, dopo le cinque personalizzazioni che
                azzera: prima era un pulsante piccolo da solo sopra le card, che sembrava
                riguardare anche la modalità (che invece non tocca). */}
            <SettingsCard
                title="Valori predefiniti"
                action={
                    <Button type="button" variant="outline" onClick={handleResetDefaults}>
                        <RotateCcw className="size-4" />
                        Ripristina predefiniti
                    </Button>
                }
            >
                <p className="text-sm text-muted-foreground">
                    Riporta colore, angoli, righe e densità delle tabelle e dimensione del testo ai valori iniziali. La
                    modalità chiara o scura resta quella scelta.
                </p>
            </SettingsCard>
        </SettingsSection>
    );
};

export default ThemeSettingsSection;
