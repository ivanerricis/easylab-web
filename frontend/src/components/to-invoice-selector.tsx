import OptionSelector, { type SelectorOption } from "@/components/option-selector";
import { ReceiptText, X } from "lucide-react";

type Props = {
    value: boolean;
    onValueChange: (value: boolean) => void;
    className?: string;
    orientation?: "horizontal" | "vertical";
};

/**
 * Prima il "no": la fattura è l'eccezione, non la regola, e l'ordine delle voci ricalca il
 * default del campo (`to_invoice` nasce a `false`).
 */
const toInvoiceOptions: SelectorOption<boolean>[] = [
    {
        value: false,
        label: "Non da fatturare",
        icon: X,
    },
    {
        value: true,
        label: "Da fatturare",
        icon: ReceiptText,
    },
];

/** Gemello di `PaidStatusSelector`: dice se va emessa fattura, non se l'intervento è saldato. */
const ToInvoiceSelector = ({ value, onValueChange, className, orientation = "horizontal" }: Props) => (
    <OptionSelector
        value={value}
        onValueChange={onValueChange}
        options={toInvoiceOptions}
        ariaLabel="Fatturazione"
        className={className}
        orientation={orientation}
    />
);

export default ToInvoiceSelector;
