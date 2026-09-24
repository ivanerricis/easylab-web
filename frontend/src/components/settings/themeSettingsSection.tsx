import { useEffect, useState } from "react";
import { Computer, Moon, RotateCcw, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingsActions, SettingsCard, SettingsGroup, SettingsSection } from "@/components/settings/settingsUi";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useTheme } from "@/components/use-theme";
import { interventionStatusColor, interventionStatusOptions } from "@/lib/interventions";
import {
    applyCornerRadius,
    applyFontSize,
    applyTableDensity,
    applyTableRowIntensity,
    applyThemeAccentPreset,
    cornerRadiusPresets,
    fontSizes,
    getStoredCornerRadius,
    getStoredFontSize,
    getStoredTableDensity,
    getStoredTableRowIntensity,
    getStoredThemeAccentPreset,
    setStoredCornerRadius,
    setStoredFontSize,
    setStoredTableDensity,
    setStoredTableRowIntensity,
    setStoredThemeAccentPreset,
    tableDensities,
    tableRowIntensities,
    themeAccentPresets,
    type CornerRadiusKey,
    type FontSizeKey,
    type TableDensityKey,
    type TableRowIntensityKey,
    type ThemeAccentPresetKey,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

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

// Sotto `sm` ogni riquadro mostra solo icona e titolo: la riga più chiara che spiega la scelta
// (es. "Interfaccia luminosa e pulita.") si vede già dall'icona e dall'etichetta, ed è lei a
// far crescere ogni pulsante più del necessario sui telefoni.
const optionDescriptionClasses = "hidden text-xs font-normal text-muted-foreground sm:block";

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
    const [selectedAccent, setSelectedAccent] = useState<ThemeAccentPresetKey>(
        () => getStoredThemeAccentPreset() ?? "default"
    );
    const [selectedRowIntensity, setSelectedRowIntensity] = useState<TableRowIntensityKey>(
        () => getStoredTableRowIntensity() ?? "default"
    );
    const [selectedDensity, setSelectedDensity] = useState<TableDensityKey>(() => getStoredTableDensity() ?? "default");
    const [selectedFontSize, setSelectedFontSize] = useState<FontSizeKey>(() => getStoredFontSize() ?? "default");
    const [selectedRadius, setSelectedRadius] = useState<CornerRadiusKey>(() => getStoredCornerRadius() ?? "default");

    useEffect(() => {
        applyThemeAccentPreset(selectedAccent);
    }, [selectedAccent]);

    const handleSelectAccent = (presetKey: ThemeAccentPresetKey) => {
        setSelectedAccent(presetKey);
        setStoredThemeAccentPreset(presetKey);
        applyThemeAccentPreset(presetKey);
    };

    const handleSelectRowIntensity = (intensityKey: TableRowIntensityKey) => {
        setSelectedRowIntensity(intensityKey);
        setStoredTableRowIntensity(intensityKey);
        applyTableRowIntensity(intensityKey);
    };

    const handleSelectDensity = (densityKey: TableDensityKey) => {
        setSelectedDensity(densityKey);
        setStoredTableDensity(densityKey);
        applyTableDensity(densityKey);
    };

    const handleSelectFontSize = (fontSizeKey: FontSizeKey) => {
        setSelectedFontSize(fontSizeKey);
        setStoredFontSize(fontSizeKey);
        applyFontSize(fontSizeKey);
    };

    const handleSelectRadius = (radiusKey: CornerRadiusKey) => {
        setSelectedRadius(radiusKey);
        setStoredCornerRadius(radiusKey);
        applyCornerRadius(radiusKey);
    };

    // Non tocca la modalità chiara/scura/sistema: è una scelta a sé, non una delle cinque
    // personalizzazioni d'aspetto qui sotto.
    const handleResetDefaults = () => {
        handleSelectAccent("default");
        handleSelectRadius("default");
        handleSelectRowIntensity("default");
        handleSelectDensity("default");
        handleSelectFontSize("default");
        toast.success("Aspetto ripristinato ai valori predefiniti");
    };

    return (
        <SettingsSection>
            <SettingsActions>
                <Button type="button" variant="outline" size="sm" onClick={handleResetDefaults}>
                    <RotateCcw className="size-4" />
                    Ripristina predefiniti
                </Button>
            </SettingsActions>

            <SettingsCard
                title="Modalità"
                description="Scegli se seguire il sistema oppure forzare il tema chiaro o scuro."
            >
                <div className="grid gap-2 sm:grid-cols-3">
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
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                    {themeAccentPresets.map((preset) => (
                        <Button
                            key={preset.key}
                            type="button"
                            variant="outline"
                            className={optionButtonClasses(selectedAccent === preset.key)}
                            onClick={() => handleSelectAccent(preset.key)}
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
                <div className="grid gap-2 sm:grid-cols-3">
                    {cornerRadiusPresets.map((preset) => (
                        <Button
                            key={preset.key}
                            type="button"
                            variant="outline"
                            className={optionButtonClasses(selectedRadius === preset.key)}
                            onClick={() => handleSelectRadius(preset.key)}
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
                <div className="grid gap-2 sm:grid-cols-3">
                    {tableRowIntensities.map((intensity) => (
                        <Button
                            key={intensity.key}
                            type="button"
                            variant="outline"
                            className={optionButtonClasses(selectedRowIntensity === intensity.key)}
                            onClick={() => handleSelectRowIntensity(intensity.key)}
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
                <div className="grid gap-2 sm:grid-cols-3">
                    {tableDensities.map((density) => (
                        <Button
                            key={density.key}
                            type="button"
                            variant="outline"
                            className={optionButtonClasses(selectedDensity === density.key)}
                            onClick={() => handleSelectDensity(density.key)}
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
                <div className="grid gap-2 sm:grid-cols-3">
                    {fontSizes.map((fontSize) => (
                        <Button
                            key={fontSize.key}
                            type="button"
                            variant="outline"
                            className={optionButtonClasses(selectedFontSize === fontSize.key)}
                            onClick={() => handleSelectFontSize(fontSize.key)}
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
        </SettingsSection>
    );
};

export default ThemeSettingsSection;
