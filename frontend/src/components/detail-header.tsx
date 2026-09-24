import TableActionButton from "@/components/table-action-button";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

type DetailHeaderProps = {
    /** Il contenuto dell'`h1`: testo, o testo con il collegamento al cliente. */
    title: ReactNode;
    onBack: () => void;
    /** I pulsanti a destra: aggiorna, modifica, stampa, elimina... */
    children?: ReactNode;
};

/**
 * Freccia indietro, titolo e azioni in cima a ogni scheda di dettaglio.
 *
 * Prima ogni pagina aveva la sua copia: report e intervento con un contenitore in più, `gap-3`
 * e il `p-2` della pagina, cliente, collaboratore e tecnico con `gap-2` e niente padding. Passando
 * da una scheda all'altra la freccia si spostava di 8px e il titolo di 12px. Ora la markup è
 * una sola.
 *
 * `flex-wrap` con il gruppo del titolo a base automatica: se titolo e azioni non stanno sulla
 * stessa riga (un telefono, il cliente con sei pulsanti) le azioni scendono sotto, allineate a
 * destra, invece di stringere il titolo su tre righe. La freccia resta sempre accanto al titolo.
 */
const DetailHeader = ({ title, onBack, children }: DetailHeaderProps) => (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
        <div className="flex min-w-0 flex-auto items-center gap-2">
            {/* `-ml-2`: il pulsante fantasma ha 8px di aria attorno all'icona, e senza
                compensarli la freccia partiva rientrata rispetto al bordo delle card sotto. */}
            <TableActionButton
                size="icon-lg"
                variant="ghost"
                onClick={onBack}
                className="-ml-2 shrink-0"
                aria-label="Torna indietro"
            >
                <ArrowLeft className="size-6" />
            </TableActionButton>
            <h1 className="min-w-0 text-xl font-bold tracking-tight wrap-break-word sm:text-2xl">{title}</h1>
        </div>

        {children ? <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
);

type DetailHeaderActionProps = Omit<ComponentProps<typeof TableActionButton>, "children" | "size"> & {
    icon: LucideIcon;
    /** La scritta accanto all'icona, visibile da `lg` in su: sotto resta la sola icona. */
    text: string;
};

/**
 * Un pulsante d'azione dell'intestazione: icona, e da `lg` la scritta. Alto 40px come il
 * pulsante "aggiorna" accanto; la scritta a 14px, come i pulsanti delle intestazioni degli
 * elenchi — prima era a 18px (`text-lg`) e nelle schede sembrava gridare più del titolo.
 */
const DetailHeaderAction = ({ icon: Icon, text, ...props }: DetailHeaderActionProps) => (
    <TableActionButton size="lg" {...props}>
        <Icon className="size-5" />
        <span className="hidden lg:inline">{text}</span>
    </TableActionButton>
);

export { DetailHeader, DetailHeaderAction };
