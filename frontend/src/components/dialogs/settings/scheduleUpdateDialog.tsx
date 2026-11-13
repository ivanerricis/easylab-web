import { useState } from "react";
import { CalendarClock } from "lucide-react";
import CustomDialog from "@/components/dialogs/customDialog";
import DatePickerField from "@/components/date-picker-field";
import FormField from "@/components/form-field";
import TimeField from "@/components/time-field";
import { SettingsErrorNote } from "@/components/settings/settingsUi";
import { getApiErrorMessage } from "@/lib/api";
import { fieldErrorAria } from "@/lib/formField";
import { suggestedUpdateSchedule, toScheduleFields, validateUpdateSchedule } from "@/lib/updateSchedule";

type Props = Readonly<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** L'istante già programmato (ISO) quando si modifica; senza, si parte dalle 03:00 della prossima notte. */
    currentScheduledAt: string | null;
    /** Salva la programmazione. Se lancia, il messaggio resta nel dialogo; se riesce, chiude lui. */
    onSubmit: (fields: { date: string; time: string }) => Promise<void>;
}>;

/** Il dialogo "Programma aggiornamento" (anche per modificare una programmazione esistente). */
const ScheduleUpdateDialog = ({ open, onOpenChange, currentScheduledAt, onSubmit }: Props) => {
    const initialFields = () => (currentScheduledAt ? toScheduleFields(currentScheduledAt) : suggestedUpdateSchedule());
    const [fields, setFields] = useState(initialFields);
    const [errors, setErrors] = useState<{ date?: string; time?: string }>({});
    const [serverError, setServerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [wasOpen, setWasOpen] = useState(open);

    // I valori di partenza si ricalcolano a ogni apertura (l'ora "suggerita" dipende da adesso).
    // Durante il render e non in un effetto: React rilancia subito il render con lo stato nuovo,
    // senza il giro in più (e il lampo dei valori vecchi) che avrebbe un effetto.
    if (open !== wasOpen) {
        setWasOpen(open);

        if (open) {
            setFields(initialFields());
            setErrors({});
            setServerError(null);
        }
    }

    const handleConfirm = async () => {
        if (isSaving) {
            return;
        }

        const validationErrors = validateUpdateSchedule(fields);
        setErrors(validationErrors);
        setServerError(null);

        if (validationErrors.date || validationErrors.time) {
            return;
        }

        setIsSaving(true);

        try {
            await onSubmit(fields);
            onOpenChange(false);
        } catch (error) {
            setServerError(getApiErrorMessage(error, "Impossibile programmare l'aggiornamento"));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <CustomDialog
            open={open}
            onOpenChange={onOpenChange}
            title={currentScheduledAt ? "Modifica aggiornamento programmato" : "Programma aggiornamento"}
            description="All'ora scelta il server installa l'ultima versione disponibile, come con «Aggiorna adesso»: l'applicazione sarà non raggiungibile per qualche minuto."
            content={
                <div className="grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField id="updateScheduleDate" label="Data" error={errors.date} className="gap-2">
                            <DatePickerField
                                id="updateScheduleDate"
                                {...fieldErrorAria("updateScheduleDate", errors.date)}
                                value={fields.date}
                                onValueChange={(date) => setFields((prev) => ({ ...prev, date }))}
                            />
                        </FormField>
                        <FormField id="updateScheduleTime" label="Ora" error={errors.time} className="gap-2">
                            <TimeField
                                id="updateScheduleTime"
                                {...fieldErrorAria("updateScheduleTime", errors.time)}
                                value={fields.time}
                                step={30}
                                onValueChange={(time) => setFields((prev) => ({ ...prev, time }))}
                            />
                        </FormField>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Le 03:00 sono suggerite perché il backup notturno parte di solito alle 02:00. Se all&apos;ora
                        scelta è in corso un backup, l&apos;aggiornamento aspetta che finisca.
                    </p>
                    {serverError ? <SettingsErrorNote label="Errore" message={serverError} /> : null}
                </div>
            }
            confirmLabel={isSaving ? "Salvataggio..." : "Programma"}
            confirmIcon={CalendarClock}
            confirmDisabled={isSaving}
            cancelDisabled={isSaving}
            onCancel={() => onOpenChange(false)}
            onConfirm={() => void handleConfirm()}
        />
    );
};

export default ScheduleUpdateDialog;
