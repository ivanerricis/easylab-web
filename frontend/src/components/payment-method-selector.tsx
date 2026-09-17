import type { PaymentMethod } from "@/types/dtos";
import OptionSelector, { type SelectorOption } from "@/components/option-selector";
import { Ban, Banknote, CreditCard } from "lucide-react";

type Props = {
    value: PaymentMethod;
    onValueChange: (value: PaymentMethod) => void;
    className?: string;
    orientation?: "horizontal" | "vertical";
};

const paymentMethodOptions: SelectorOption<PaymentMethod>[] = [
    {
        value: "non_paid",
        label: "Non pagato",
        icon: Ban,
    },
    {
        value: "cash",
        label: "Contanti",
        icon: Banknote,
    },
    {
        value: "card",
        label: "Carta",
        icon: CreditCard,
    },
];

const PaymentMethodSelector = ({ value, onValueChange, className, orientation = "horizontal" }: Props) => (
    <OptionSelector
        value={value}
        onValueChange={onValueChange}
        options={paymentMethodOptions}
        ariaLabel="Metodo di pagamento"
        className={className}
        orientation={orientation}
    />
);

export default PaymentMethodSelector;
