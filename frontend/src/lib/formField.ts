/**
 * Le funzioni di supporto dei campi di form.
 *
 * Stanno qui e non accanto a `FormField` perché un file che esporta componenti deve esportare
 * solo componenti: altrimenti il refresh rapido di Vite ricarica la pagina intera invece del
 * solo componente modificato (lo segnala `react-refresh/only-export-components`).
 */

/** L'id del paragrafo d'errore di un campo: la convenzione sta scritta in un posto solo. */
export const fieldErrorId = (id: string) => `${id}-error`;

/**
 * Le proprietà da mettere sul controllo dentro un `FormField`, coerenti con quello che
 * `FormField` disegna intorno: `aria-invalid` accende il bordo rosso che i componenti `ui`
 * hanno già, e `aria-describedby` è ciò che fa leggere il messaggio d'errore insieme al campo
 * invece di lasciarlo un paragrafo qualsiasi lì vicino.
 */
export const fieldProps = (id: string, options: { error?: string; required?: boolean } = {}) => ({
    id,
    "aria-invalid": options.error ? true : undefined,
    "aria-describedby": options.error ? fieldErrorId(id) : undefined,
    "aria-required": options.required ? true : undefined,
});

/**
 * Le stesse proprietà aria per i controlli che non accettano `fieldProps` intero, perché hanno
 * un elenco di proprietà proprio: `InputWithAdd`, `DatePickerField`, `SelectTrigger`. Qui
 * l'`id` lo mette già il chiamante, e `aria-required` non si applica.
 */
export const fieldErrorAria = (id: string, error?: string) => ({
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? fieldErrorId(id) : undefined,
});

/**
 * Se un modulo è diverso da com'era all'apertura: è ciò che decide se chiudere il dialogo
 * chiede conferma (vedi `isDirty` in `CustomDialog`).
 *
 * Il confronto è per valore e non per riferimento, perché ogni battitura crea un oggetto
 * nuovo: scrivere una lettera e cancellarla riporta il modulo "pulito", come ci si aspetta.
 * I valori dei moduli sono stringhe, numeri e booleani, quindi `JSON.stringify` basta —
 * purché i due oggetti abbiano le chiavi nello stesso ordine, e qui nascono sempre dalla
 * stessa funzione o dallo stesso letterale.
 */
export const hasFormChanged = <T extends object>(current: T, initial: T) =>
    JSON.stringify(current) !== JSON.stringify(initial);
