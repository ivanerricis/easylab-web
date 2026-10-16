import { getCompanySettings } from "./companyManager";
import { getEmailSettings, isEmailConfigured, sendEmail } from "./emailManager";

// Gli avvisi tecnici (nuovo dispositivo, backup falliti, spazio su disco) vanno all'indirizzo
// dedicato delle impostazioni email; se è vuoto, all'email dell'azienda. Sta qui e non in
// emailManager perché emailManager non debba importare companyManager.
// Gli errori di invio li gestisce chi chiama: un avviso non deve far fallire l'operazione.
export const sendAlertEmail = async ({ subject, text }: { subject: string; text: string }): Promise<void> => {
    if (!(await isEmailConfigured())) {
        return;
    }

    const to = (await getEmailSettings()).alertEmail || (await getCompanySettings()).email;

    if (!to) {
        return;
    }

    await sendEmail({ to, subject, text });
};
