import OptionSelector, { type SelectorOption } from "@/components/option-selector";
import { Ban, CircleCheck } from "lucide-react";

type Props = {
    value: boolean;
    onValueChange: (value: boolean) => void;
    className?: string;
    orientation?: "horizontal" | "vertical";
};

const paidStatusOptions: SelectorOption<boolean>[] = [
    {
        value: false,
        label: "Non pagato",
        icon: Ban,
    },
    {
        value: true,
        label: "Pagato",
        icon: CircleCheck,
    },
];

/**
 * Stessa resa a schermo di `PaymentMethodSelector` (i report), ma con due sole voci: qui non
 * conta il mezzo di pagamento, solo se l'intervento è stato saldato o no.
 */
const PaidStatusSelector = ({ value, onValueChange, className, orientation = "horizontal" }: Props) => (
    <OptionSelector
        value={value}
        onValueChange={onValueChange}
        options={paidStatusOptions}
        ariaLabel="Pagamento"
        className={className}
        orientation={orientation}
    />
);

export default PaidStatusSelector;
