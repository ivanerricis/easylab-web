import type { PaymentMethod } from "@/types/dtos";
import OptionSelector, { type SelectorOption } from "@/components/option-selector";
import { Ban, Banknote, CreditCard } from "lucide-react";
import { paymentMethodLabels } from "@/lib/reports";

type Props = {
    value: PaymentMethod;
    onValueChange: (value: PaymentMethod) => void;
    className?: string;
    orientation?: "horizontal" | "vertical";
};

const paymentMethodOptions: SelectorOption<PaymentMethod>[] = [
    { value: "non_paid", label: paymentMethodLabels.non_paid, icon: Ban },
    { value: "cash", label: paymentMethodLabels.cash, icon: Banknote },
    { value: "card", label: paymentMethodLabels.card, icon: CreditCard },
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
