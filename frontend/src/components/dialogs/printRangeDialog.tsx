import { useState } from "react";
import CustomDialog from "@/components/dialogs/customDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer } from "lucide-react";

type PrintRangeDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    onConfirm: (range: { dateFrom?: string; dateTo?: string }) => void;
};

const PrintRangeDialog = ({
    open,
    onOpenChange,
    title,
    description = "Specifica un intervallo di date oppure lascia i campi vuoti per stampare tutto lo storico.",
    onConfirm,
}: PrintRangeDialogProps) => {
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [confirmingAll, setConfirmingAll] = useState(false);

    // Reimposta i campi ad ogni riapertura: aggiustamento in fase di render (non in un
    // effect) per evitare il doppio render che causerebbe un useEffect equivalente.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setDateFrom("");
            setDateTo("");
            setConfirmingAll(false);
        }
    }

    const confirmAndClose = (range: { dateFrom?: string; dateTo?: string }) => {
        onConfirm(range);
        setConfirmingAll(false);
        onOpenChange(false);
    };

    const handleConfirm = () => {
        if (!dateFrom && !dateTo) {
            setConfirmingAll(true);
            return;
        }
        confirmAndClose({ dateFrom, dateTo });
    };

    return (
        <>
            <CustomDialog
                open={open && !confirmingAll}
                onOpenChange={onOpenChange}
                title={title}
                description={description}
                confirmLabel="Stampa"
                confirmIcon={Printer}
                cancelLabel="Annulla"
                onCancel={() => onOpenChange(false)}
                onConfirm={handleConfirm}
                content={
                    // Etichette e campi alla stessa misura degli altri dialoghi, e un po' d'aria
                    // sotto la descrizione, a cui prima le etichette stavano attaccate. Sotto sm
                    // le due date vanno una sotto l'altra: affiancate non ci stavano.
                    <div className="grid gap-4 py-4 sm:grid-cols-2">
                        <div className="grid gap-1">
                            <Label htmlFor="print-range-date-from" className="text-lg">
                                Da
                            </Label>
                            <Input
                                id="print-range-date-from"
                                type="date"
                                className="text-lg!"
                                value={dateFrom}
                                max={dateTo || undefined}
                                onChange={(event) => setDateFrom(event.target.value)}
                            />
                        </div>
                        <div className="grid gap-1">
                            <Label htmlFor="print-range-date-to" className="text-lg">
                                A
                            </Label>
                            <Input
                                id="print-range-date-to"
                                type="date"
                                className="text-lg!"
                                value={dateTo}
                                min={dateFrom || undefined}
                                onChange={(event) => setDateTo(event.target.value)}
                            />
                        </div>
                    </div>
                }
            />

            <CustomDialog
                open={confirmingAll}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) setConfirmingAll(false);
                }}
                title="Stampare tutto lo storico?"
                description="Non hai specificato un intervallo di date: verrà stampato tutto lo storico disponibile."
                confirmLabel="Stampa tutto"
                confirmIcon={Printer}
                cancelLabel="Annulla"
                onCancel={() => setConfirmingAll(false)}
                onConfirm={() => confirmAndClose({ dateFrom: undefined, dateTo: undefined })}
            />
        </>
    );
};

export default PrintRangeDialog;
