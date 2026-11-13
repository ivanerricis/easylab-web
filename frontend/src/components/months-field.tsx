import FormField from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fieldErrorAria, fieldProps } from "@/lib/formField";
import { maxContractMonths, monthsPresets } from "@/lib/contracts";
import { useState } from "react";

const customValue = "custom";

type Props = {
    /** L'id del controllo che porta il valore (la select, o la casella numerica quando si scrive a mano). */
    id: string;
    label: string;
    /** I mesi come testo. */
    value: string;
    onChange: (value: string) => void;
    error?: string;
    /** Una nota sotto il campo, per dire perché il valore è fisso quando `disabled`. */
    description?: string;
    /** Il valore non si cambia (un pacchetto con durata fissa): menu e casella restano visibili ma spenti. */
    disabled?: boolean;
    className?: string;
};

/**
 * Un numero di mesi: le durate più usate sono nel menu, e «Altro…» apre una casella dove scrivere
 * quella che serve. Un valore che non è fra quelle proposte (un contratto di 18 mesi che si modifica)
 * apre la casella da solo.
 */
const MonthsField = ({ id, label, value, onChange, error, description, disabled, className }: Props) => {
    const [isCustomChosen, setIsCustomChosen] = useState(false);
    const isPreset = monthsPresets.some((months) => String(months) === value.trim());
    const showsInput = isCustomChosen || !isPreset;

    return (
        <FormField id={id} label={label} className={className} error={error} description={description}>
            <div className="grid gap-2">
                <Select
                    disabled={disabled}
                    value={showsInput ? customValue : value}
                    onValueChange={(next) => {
                        if (next === customValue) {
                            setIsCustomChosen(true);

                            return;
                        }

                        setIsCustomChosen(false);
                        onChange(next);
                    }}
                >
                    <SelectTrigger
                        // Con la casella aperta l'etichetta passa alla casella: la select ha un nome suo.
                        {...(showsInput ? { "aria-label": `${label}: scelta` } : { id })}
                        {...fieldErrorAria(id, showsInput ? undefined : error)}
                        className="w-full"
                    >
                        <SelectValue placeholder="Seleziona" />
                    </SelectTrigger>
                    <SelectContent>
                        {monthsPresets.map((months) => (
                            <SelectItem key={months} value={String(months)}>
                                {months} mesi
                            </SelectItem>
                        ))}
                        <SelectItem value={customValue}>Altro…</SelectItem>
                    </SelectContent>
                </Select>
                {showsInput ? (
                    <Input
                        {...fieldProps(id, { error, required: true })}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={maxContractMonths}
                        step={1}
                        disabled={disabled}
                        placeholder="Numero di mesi"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                    />
                ) : null}
            </div>
        </FormField>
    );
};

export default MonthsField;
