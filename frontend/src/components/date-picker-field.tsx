import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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

const formatDateValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
    const label = selectedDate
        ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(selectedDate)
        : placeholder;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    aria-invalid={ariaInvalid}
                    aria-describedby={ariaDescribedBy}
                    type="button"
                    variant="outline"
                    className={cn("w-full justify-start gap-2 text-lg! font-normal", className)}
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
                            onValueChange(formatDateValue(date));
                        }
                    }}
                    className="rounded-md border"
                />
            </PopoverContent>
        </Popover>
    );
};

export default DatePickerField;
