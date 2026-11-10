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
    /**
     * La misura dell'etichetta: `lg` nei dialoghi (di serie), `sm` nelle Impostazioni, dove è
     * quella di `Label` stesso. Una misura e non una classe libera perché passare `text-sm`
     * sopra `text-lg` non basterebbe: tailwind-merge toglierebbe anche il `leading-none` di
     * `Label`, e l'etichetta diventerebbe più alta di com'era.
     */
    labelSize?: "lg" | "sm";
    /**
     * Controllo ed errore in un blocco solo, invece che due righe della griglia. Serve dove la
     * griglia intorno ha un numero fisso di righe: `SettingsField` allinea etichette e controlli
     * di due campi affiancati con due righe condivise (subgrid), e l'errore come terza riga
     * finirebbe sovrapposto al controllo. Nel blocco l'errore sta a 4px dal controllo (il suo
     * `mt-1`) invece che a 4px più lo spazio della griglia.
     */
    groupControlAndError?: boolean;
    /** Una nota sotto il campo (e sotto l'errore): cosa inserire, o cosa succede lasciandolo vuoto. */
    description?: ReactNode;
    children: ReactNode;
};

/**
 * L'asterisco visibile e il testo "(obbligatorio)" per gli screen reader, da mettere dentro
 * un'etichetta. Estratto da `FormField` per le etichette che non passano da lì (le Impostazioni
 * di azienda ed email), che altrimenti duplicherebbero questo markup campo per campo.
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
 * impaginazione di etichette: l'accesso, le Impostazioni di azienda ed email, le caselle di
 * spunta con l'etichetta accanto invece che sopra.
 *
 * Il messaggio è un'etichetta a cavallo del bordo inferiore del controllo, fuori dal flusso: prima
 * era un paragrafo che spingeva giù tutto il resto, e correggendo un campo il modulo intero
 * risaliva di una riga. Così niente si sposta, e a metà sta dentro il controllo (dove c'è
 * margine sotto il testo) e a metà nello spazio vuoto prima del campo dopo, senza coprirne
 * l'etichetta. Si posiziona
 * rispetto al contenitore del campo, che quindi deve essere `relative` (`FormField` lo è; chi usa
 * `FieldError` da solo lo mette sul proprio blocco). Sfondo pieno, come le tendine: il fumetto sta
 * sopra l'etichetta del campo dopo e non deve lasciarla trasparire.
 */
export const FieldError = ({ id, error }: { id: string; error?: string }) => {
    if (!error) {
        return null;
    }

    return (
        <p
            id={fieldErrorId(id)}
            role="alert"
            className="absolute top-full left-2 z-1 w-fit max-w-[calc(100%-1rem)] -translate-y-1/3 rounded-md border border-destructive/40 bg-card px-2 py-0.5 text-xs leading-4 font-medium text-destructive-text shadow-sm"
        >
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
 *
 * I campi dei dialoghi di report e interventi e quelli del backup passano tutti da qui: prima una
 * cinquantina erano scritti a mano (etichetta, asterisco, controllo, errore), e ogni ritocco
 * all'etichetta andava ripetuto campo per campo. `className` porta la spaziatura e la colonna
 * della griglia intorno (`gap-1`, `lg:col-span-2`…).
 */
const FormField = ({
    id,
    label,
    required = false,
    error,
    className,
    labelSize = "lg",
    groupControlAndError = false,
    description,
    children,
}: FormFieldProps) => {
    const fieldError = <FieldError id={id} error={error} />;

    return (
        <div className={cn("relative grid", className)}>
            <Label htmlFor={id} className={labelSize === "lg" ? "text-lg" : undefined}>
                {label}
                {required ? <RequiredMark /> : null}
            </Label>
            {groupControlAndError ? (
                <div className="relative">
                    {children}
                    {fieldError}
                </div>
            ) : (
                <>
                    {children}
                    {fieldError}
                </>
            )}
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
    );
};

export default FormField;
