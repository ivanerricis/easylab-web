import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatDate, formatDateISO } from "@/lib/utils";
import { CalendarDays } from "lucide-react";

type Props = {
    id?: string;
    /** Segnala il campo come invalido: accende il bordo rosso del pulsante. */
    "aria-invalid"?: boolean;
    /** L'id del paragrafo d'errore, così lo screen reader lo legge insieme al campo. */
    "aria-describedby"?: string;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    className?: string;
};

const parseDateValue = (value: string) => {
    if (!value) {
        return undefined;
    }

    const [year, month, day] = value.split("-").map(Number);

    if (!year || !month || !day) {
        return undefined;
    }

    return new Date(year, month - 1, day);
};

const DatePickerField = ({
    id,
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedBy,
    value,
    onValueChange,
    placeholder = "Seleziona data",
    className,
}: Props) => {
    const selectedDate = parseDateValue(value);
    const label = selectedDate ? formatDate(selectedDate) : placeholder;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    aria-invalid={ariaInvalid}
                    aria-describedby={ariaDescribedBy}
                    type="button"
                    variant="outline"
                    // Stesso corpo testo degli `Input`/`Textarea` dei dialoghi (vedi
                    // `CustomDialog`): qui va fissato nel componente perché non è un `Input` e
                    // quella regola non lo tocca. Nessun `!`: a differenza di `Input`, `Button`
                    // non ha un `md:text-sm` di base con cui competere. Alto 40px come gli altri campi
                    // dei dialoghi (vedi `CustomDialog`).
                    // `border-input`: il bordo dei campi, non quello (più chiaro) dei pulsanti
                    // outline; il fondo in scuro (`bg-input/30`) è già quello dei campi, che ora
                    // usano lo stesso. Senza data il testo è grigio come un segnaposto.
                    className={cn(
                        "h-10 w-full justify-start gap-2 border-input text-lg font-normal",
                        !selectedDate && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarDays className="size-4" />
                    <span className="truncate">{label}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                    mode="single"
                    selected={selectedDate}
                    defaultMonth={selectedDate}
                    onSelect={(date) => {
                        if (date) {
                            onValueChange(formatDateISO(date));
                        }
                    }}
                    className="rounded-md border"
                />
            </PopoverContent>
        </Popover>
    );
};

export default DatePickerField;
