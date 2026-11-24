import type { CustomerDeviceType } from "../db/schema";

/** Le etichette italiane dei tipi di dispositivo: quelle dei PDF e delle email (la UI ha le sue, stesse parole). */
export const customerDeviceTypeLabels: Record<CustomerDeviceType, string> = {
    pc_desktop: "PC Desktop",
    server: "Server",
    copier: "Fotocopiatrice",
    firewall: "Firewall",
    cash_register: "Registratore di cassa",
};

type DeviceLabelInput = { name: string; type: CustomerDeviceType; serialNumber: string };

/** "Nome – Tipo – S/N xxx": la riga con cui un dispositivo compare nei PDF. */
export const formatDeviceLine = ({ name, type, serialNumber }: DeviceLabelInput) =>
    `${name} – ${customerDeviceTypeLabels[type]} – S/N ${serialNumber}`;
