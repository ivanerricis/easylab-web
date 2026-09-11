import { Label } from "@/components/ui/label";
import { fieldErrorId } from "@/lib/formField";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type FormFieldProps = {
    /** Deve combaciare con l'`id` del controllo che sta dentro: è quello che li lega. */
    id: string;
    label: string;
    /** Aggiunge l'asterisco visibile e "(obbligatorio)" per gli screen reader. */
    required?: boolean;
    /** L'errore di questo campo. Quando c'è, compare sotto il controllo. */
    error?: string;
    className?: string;
    children: ReactNode;
};

/**
 * L'asterisco visibile e il testo "(obbligatorio)" per gli screen reader, da mettere dentro
 * un'etichetta. Estratto da `FormField` per le stesse etichette scritte a mano nei dialoghi di
 * report e interventi (vedi `FieldError`), che altrimenti duplicherebbero questo markup campo
 * per campo.
 */
export const RequiredMark = () => (
    <>
        <span aria-hidden="true" className="text-destructive">
            *
        </span>
        <span className="sr-only">(obbligatorio)</span>
    </>
);

/**
 * Il solo messaggio d'errore, da mettere sotto un controllo nei form che hanno già la propria
 * impaginazione di etichette: i dialoghi di report e interventi, dove i campi stanno in griglie
 * a due colonne e non conviene rifarne il contorno.
 */
export const FieldError = ({ id, error }: { id: string; error?: string }) => {
    if (!error) {
        return null;
    }

    return (
        <p id={fieldErrorId(id)} role="alert" className="mt-1 text-sm font-medium text-destructive">
            {error}
        </p>
    );
};

/**
 * Un campo di form con la sua etichetta e il suo errore.
 *
 * Prima gli errori di validazione dei dialoghi erano tutti `toast.error`: un avviso che compare
 * in alto, scompare da solo dopo qualche secondo e non dice *quale* campo sia il problema — su
 * un form da otto campi bisognava indovinarlo. Il messaggio ora sta sotto il campo che lo
 * riguarda, resta lì finché non si corregge, ed è collegato al controllo con `aria-describedby`,
 * quindi chi usa uno screen reader lo sente quando arriva sul campo.
 *
 * I toast restano per gli errori che *non* appartengono a un campo: il rifiuto del server, la
 * rete che non risponde.
 */
const FormField = ({ id, label, required = false, error, className, children }: FormFieldProps) => {
    return (
        <div className={cn("grid", className)}>
            <Label htmlFor={id} className="text-lg">
                {label}
                {required ? <RequiredMark /> : null}
            </Label>
            {children}
            <FieldError id={id} error={error} />
        </div>
    );
};

export default FormField;
