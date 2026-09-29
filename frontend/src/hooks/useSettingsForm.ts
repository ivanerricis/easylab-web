import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";
import { hasFormChanged, reportFieldErrors } from "@/lib/formField";

type FieldErrors<TField extends string> = Partial<Record<TField, string>>;

type Options<TDto, TForm extends object, TField extends string> = {
    /** Legge le impostazioni dal server; chiamata una volta sola, al montaggio. */
    load: () => Promise<TDto>;
    /**
     * Invia al server i valori del modulo, già validati; restituisce le impostazioni salvate.
     * Qui chi chiama ripulisce i valori (spazi, fuso canonico...) prima di spedirli.
     */
    save: (values: TForm) => Promise<TDto>;
    /** I campi del modulo letti dalla risposta del server (caricamento o salvataggio). */
    toForm: (dto: TDto) => TForm;
    /** I valori del modulo prima che arrivi la prima risposta, o se il caricamento fallisce. */
    defaultValues: TForm;
    /**
     * Gli errori per id del controllo; riceve anche l'ultima risposta del server, perché alcune
     * regole dipendono da lì (una password già salvata non va riscritta, per esempio).
     */
    validate?: (values: TForm, data: TDto | null) => FieldErrors<TField>;
    /** Gli id dei campi validati nell'ordine della pagina: il primo sbagliato riceve il focus. */
    fieldOrder?: readonly TField[];
    /**
     * Se il modulo è diverso dall'ultimo stato salvato. Di serie il confronto per valore; va
     * sostituito dove un campo segreto (una password che il server non restituisce mai) conta
     * come modifica appena lo si scrive (vedi `isSettingsFormDirty`).
     */
    isDirty?: (current: TForm, saved: TForm) => boolean;
    /** Chiamata a ogni cambio di "ci sono modifiche non salvate", e con `false` allo smontaggio. */
    onDirtyChange?: (isDirty: boolean) => void;
    messages: {
        /** Il testo del toast se il caricamento fallisce e il server non ne dà uno suo. */
        loadError: string;
        /** Il testo del toast se il salvataggio fallisce e il server non ne dà uno suo. */
        saveError: string;
        /** Il toast di salvataggio riuscito. */
        saved: string;
    };
};

/**
 * Il ciclo di vita comune dei pannelli di impostazioni: carica il DTO nel modulo e nell'ultimo
 * stato salvato, tiene gli stati di caricamento e salvataggio, valida mostrando gli errori sotto
 * i campi, salva, riallinea il modulo alla risposta del server e avvisa con un toast.
 *
 * Prima ognuno dei pannelli (azienda, email, backup, conservazione dei log) lo riscriveva a
 * mano, con piccole differenze non volute: l'email costruiva la stessa conversione DTO → modulo
 * due volte, e la segnalazione delle modifiche non salvate alla pagina era copiata in tre posti.
 *
 * Tiene l'ultimo DTO intero (`data`) e non solo i valori del modulo: da lì leggono i campi di sola
 * lettura (lo stato dell'ultimo backup, "password già impostata"...), e `savedValues` ne è la
 * proiezione, così non può disallinearsi. `setData` serve alle azioni che ricevono dal server un
 * DTO nuovo senza toccare il modulo (esecuzione o ripristino di un backup).
 */
export const useSettingsForm = <TDto, TForm extends object, TField extends string = never>({
    load,
    save,
    toForm,
    defaultValues,
    validate,
    fieldOrder = [],
    isDirty: isDirtyComparer = hasFormChanged,
    onDirtyChange,
    messages,
}: Options<TDto, TForm, TField>) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [data, setData] = useState<TDto | null>(null);
    const [formValues, setFormValues] = useState<TForm>(defaultValues);
    const [errors, setErrors] = useState<FieldErrors<TField>>({});

    const savedValues = data === null ? defaultValues : toForm(data);
    const isDirty = isDirtyComparer(formValues, savedValues);

    // La pagina Impostazioni chiede conferma prima di lasciare la sezione con modifiche non
    // salvate: le serve sapere quando il modulo è diverso da quanto salvato. Allo smontaggio
    // (sezione cambiata) non ci sono più modifiche in sospeso.
    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

    // Un evento e non una dipendenza dell'effetto: `load` è una funzione nuova a ogni render,
    // e il caricamento deve partire una volta sola al montaggio.
    const loadSettings = useEffectEvent(async () => {
        setIsLoading(true);

        try {
            const result = await load();
            setData(result);
            setFormValues(toForm(result));
        } catch (error) {
            toast.error(getApiErrorMessage(error, messages.loadError));
        } finally {
            setIsLoading(false);
        }
    });

    useEffect(() => {
        startTransition(() => {
            void loadSettings();
        });
    }, []);

    /** Mostra gli errori sotto i campi e mette a fuoco il primo sbagliato; vero se ce n'è uno. */
    const reportErrors = (nextErrors: FieldErrors<TField>) => reportFieldErrors(nextErrors, fieldOrder, setErrors);

    const handleSave = async () => {
        if (isSaving || isLoading) {
            return;
        }

        if (reportErrors(validate?.(formValues, data) ?? {})) {
            return;
        }

        try {
            setIsSaving(true);
            const result = await save(formValues);
            setData(result);
            // Il modulo prende i valori salvati, non resta com'era: quelli inviati sono ripuliti
            // dagli spazi, e un " nas.local " rimasto nel campo contro il "nas.local" salvato
            // lasciava il modulo "modificato" (e Salva attivo) subito dopo il salvataggio.
            setFormValues(toForm(result));
            toast.success(messages.saved);
        } catch (error) {
            toast.error(getApiErrorMessage(error, messages.saveError));
        } finally {
            setIsSaving(false);
        }
    };

    return {
        /** L'ultima risposta del server, `null` finché non ne è arrivata una. */
        data,
        setData,
        formValues,
        setFormValues,
        savedValues,
        isDirty,
        isLoading,
        isSaving,
        errors,
        setErrors,
        reportErrors,
        handleSave,
    };
};
