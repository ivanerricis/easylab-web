import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

const pad = (value: number) => String(value).padStart(2, "0");
const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
};
const toTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/**
 * Legge quello che si scrive in un campo orario: "9", "9.40", "9:40", "940", "0940", "1415".
 * Restituisce "HH:MM" oppure `null` se non è un orario valido (nessun valore indovinato).
 */
const parseTimeInput = (text: string): string | null => {
    const clean = text.trim().replace(/[.,\s]+/g, ":");
    const separated = /^(\d{1,2}):(\d{1,2})$/.exec(clean);
    const compact = /^(\d{1,2})(\d{2})$/.exec(clean);
    const hoursOnly = /^(\d{1,2})$/.exec(clean);
    const match = separated ?? compact ?? (hoursOnly ? [clean, hoursOnly[1], "0"] : null);

    if (!match) {
        return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    return hours < 24 && minutes < 60 ? `${pad(hours)}:${pad(minutes)}` : null;
};

/**
 * Le cifre scritte ("9", "14", "940") corrispondono all'orario? Una o due cifre che sono un'ora
 * valida ("14") indicano l'ora: "14" non deve proporre anche 01:45. Con tre cifre in poi si legge
 * l'orario senza lo zero davanti ("940" → 09:40).
 */
const matchesTyped = (time: string, typed: string) => {
    const [hours] = time.split(":");
    const digits = time.replace(":", "");

    if (typed.length === 1) {
        return hours.replace(/^0/, "").startsWith(typed) || hours.startsWith(typed);
    }

    if (typed.length === 2 && Number(typed) < 24) {
        return hours === typed;
    }

    return digits.startsWith(typed) || digits.replace(/^0/, "").startsWith(typed);
};

const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    if (!hours) {
        return `${rest} min`;
    }

    return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

type Props = {
    id?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    /** "HH:MM", oppure vuoto se l'orario non è stato scelto. */
    value: string;
    onValueChange: (value: string) => void;
    /** Distanza fra gli orari proposti, in minuti. */
    step?: number;
    /**
     * Orario di inizio, per un campo "fine": l'elenco parte dopo di lui e accanto a ogni orario
     * compare la durata (es. "1 h 30 min").
     */
    after?: string;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
};

/**
 * Campo orario a tendina con completamento: un elenco di orari a passo fisso (15 minuti) da
 * scegliere con un tocco, oppure da scrivere a mano ("9.40", "1415"). Sostituisce `type="time"`,
 * che cambia aspetto da browser a browser e su desktop obbliga a digitare tre segmenti minuscoli.
 *
 * È un combobox (WAI-ARIA): il campo di testo tiene il focus, le frecce spostano la voce
 * evidenziata, Invio la sceglie, Esc chiude. All'uscita dal campo l'orario scritto viene
 * confermato se è valido, altrimenti si torna a quello di prima.
 */
const TimeField = ({
    id,
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedBy,
    value,
    onValueChange,
    step = 15,
    after,
    placeholder = "--:--",
    disabled,
    className,
}: Props) => {
    const listId = useId();
    const anchorRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    // `null` = non si sta scrivendo: il campo mostra il valore. Così il testo a metà ("9.") non
    // ripassa dal valore ad ogni tasto.
    const [draft, setDraft] = useState<string | null>(null);
    // La voce evidenziata scelta con frecce o mouse; `null` = quella di partenza (vedi `activeIndex`).
    const [highlight, setHighlight] = useState<number | null>(null);

    const afterMinutes = after ? toMinutes(after) : null;

    const options = useMemo(() => {
        const first = afterMinutes === null ? 0 : afterMinutes + step;
        const times: string[] = [];

        for (let minutes = first; minutes < 24 * 60; minutes += step) {
            times.push(toTime(minutes));
        }

        return times;
    }, [afterMinutes, step]);

    // Chi scrive filtra l'elenco sulle cifre ("9" → 09:xx, "14" → 14:xx); chi apre soltanto lo vede tutto.
    const typed = draft?.replace(/\D/g, "") ?? "";
    const visible = useMemo(
        () => (typed ? options.filter((time) => matchesTyped(time, typed)) : options),
        [options, typed]
    );

    // Di partenza la voce evidenziata è quella scelta; mentre si scrive, la prima che corrisponde.
    const startIndex = typed ? 0 : Math.max(visible.indexOf(value), 0);
    const activeIndex = Math.min(highlight ?? startIndex, Math.max(visible.length - 1, 0));

    useEffect(() => {
        if (open) {
            listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
        }
    }, [open, activeIndex, visible]);

    const choose = (time: string) => {
        onValueChange(time);
        setDraft(null);
        setHighlight(null);
        setOpen(false);
    };

    // Conferma ciò che è scritto: vuoto lascia vuoto, non valido torna al valore di prima.
    const commitDraft = () => {
        if (draft === null) {
            return;
        }

        if (draft.trim() === "") {
            onValueChange("");
        } else {
            const parsed = parseTimeInput(draft);

            if (parsed) {
                onValueChange(parsed);
            }
        }

        setDraft(null);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        switch (event.key) {
            case "ArrowDown":
            case "ArrowUp": {
                event.preventDefault();

                if (!open) {
                    setOpen(true);
                    return;
                }

                const delta = event.key === "ArrowDown" ? 1 : -1;
                setHighlight(Math.min(Math.max(activeIndex + delta, 0), Math.max(visible.length - 1, 0)));
                break;
            }
            case "Enter": {
                // Dentro un form Invio non deve inviarlo mentre si sta scegliendo un orario.
                if (open || draft !== null) {
                    event.preventDefault();
                }

                // Un orario scritto per intero vince sulla voce evidenziata ("9.40" non è nell'elenco).
                const parsed = draft === null ? null : parseTimeInput(draft);
                const highlighted = visible[activeIndex];

                if (parsed && (typed.length >= 3 || !highlighted)) {
                    choose(parsed);
                } else if (highlighted && open) {
                    choose(highlighted);
                } else if (parsed) {
                    choose(parsed);
                } else {
                    setDraft(null);
                    setOpen(false);
                }

                break;
            }
            case "Tab": {
                commitDraft();
                setOpen(false);
                break;
            }
        }
    };

    return (
        <Popover open={open && !disabled} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
                <div ref={anchorRef} className={cn("relative", className)}>
                    <Input
                        id={id}
                        role="combobox"
                        aria-expanded={open}
                        aria-controls={listId}
                        aria-autocomplete="list"
                        aria-activedescendant={
                            open && visible[activeIndex] ? `${listId}-${visible[activeIndex]}` : undefined
                        }
                        aria-invalid={ariaInvalid}
                        aria-describedby={ariaDescribedBy}
                        disabled={disabled}
                        // Tastierino numerico sul telefono: l'elenco resta il modo principale di scegliere,
                        // scrivere è la scorciatoia ("1415").
                        inputMode="numeric"
                        placeholder={placeholder}
                        value={draft ?? value}
                        // Stesse misure di `DatePickerField`, che sta accanto nello stesso dialogo.
                        className="h-10 pr-9 text-lg tabular-nums"
                        onChange={(event) => {
                            setDraft(event.target.value);
                            setHighlight(null);
                            setOpen(true);
                        }}
                        onFocus={(event) => {
                            event.target.select();
                            setHighlight(null);
                            setOpen(true);
                        }}
                        onClick={() => setOpen(true)}
                        onBlur={() => {
                            commitDraft();
                        }}
                        onKeyDown={handleKeyDown}
                    />
                    <Clock
                        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                </div>
            </PopoverAnchor>
            <PopoverContent
                align="start"
                className="w-(--radix-popover-trigger-width) min-w-40 p-1"
                // Il focus resta nel campo: l'elenco si usa senza togliergli la tastiera.
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                // Esc lo intercetta il popup prima del campo (e prima del dialogo che lo contiene, che
                // così non si chiude): scartare quello che si stava scrivendo spetta a lui.
                onEscapeKeyDown={() => setDraft(null)}
                onInteractOutside={(event) => {
                    // Un tocco sul campo stesso non è "fuori": non deve chiudere e riaprire l'elenco.
                    if (anchorRef.current?.contains(event.target as Node)) {
                        event.preventDefault();
                    }
                }}
            >
                <div
                    ref={listRef}
                    id={listId}
                    role="listbox"
                    className="max-h-56 overflow-y-auto"
                    // Il clic non sposta il focus fuori dal campo (altrimenti `onBlur` confermerebbe il testo prima).
                    onMouseDown={(event) => event.preventDefault()}
                >
                    {visible.length === 0 ? (
                        <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                            Premi Invio per usare l&apos;orario scritto
                        </p>
                    ) : (
                        visible.map((time, index) => (
                            <div
                                key={time}
                                id={`${listId}-${time}`}
                                role="option"
                                aria-selected={index === activeIndex}
                                data-current={time === value || undefined}
                                className={cn(
                                    "flex min-h-10 cursor-default items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-base tabular-nums select-none",
                                    index === activeIndex && "bg-accent text-accent-foreground",
                                    time === value && "font-semibold"
                                )}
                                onMouseMove={() => setHighlight(index)}
                                onClick={() => choose(time)}
                            >
                                <span>{time}</span>
                                {afterMinutes !== null ? (
                                    <span className="text-sm font-normal text-muted-foreground">
                                        {formatDuration(toMinutes(time) - afterMinutes)}
                                    </span>
                                ) : null}
                            </div>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default TimeField;
