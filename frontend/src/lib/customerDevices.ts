import type { CustomerDeviceType, LinkedDeviceDto } from "@/types/dtos";

/** I tipi di dispositivo del cliente, nell'ordine in cui compaiono nei select. */
export const customerDeviceTypeOptions: { value: CustomerDeviceType; label: string }[] = [
    { value: "pc_desktop", label: "PC Desktop" },
    { value: "server", label: "Server" },
    { value: "copier", label: "Fotocopiatrice" },
    { value: "firewall", label: "Firewall" },
    { value: "cash_register", label: "Registratore di cassa" },
];

export const customerDeviceTypeLabels = Object.fromEntries(
    customerDeviceTypeOptions.map(({ value, label }) => [value, label])
) as Record<CustomerDeviceType, string>;

/** "Nome – Tipo – S/N xxx": come un dispositivo compare nelle liste di scelta e nei PDF. */
export const formatDeviceLine = ({
    name,
    type,
    serialNumber,
}: Pick<LinkedDeviceDto, "name" | "type" | "serialNumber">) =>
    `${name} – ${customerDeviceTypeLabels[type]} – S/N ${serialNumber}`;
