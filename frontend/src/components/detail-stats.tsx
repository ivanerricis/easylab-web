import StatusBadge from "@/components/status-badge";
import type { StatusColor } from "@/lib/statusColors";
import type { ReactNode } from "react";

export type DetailStat = {
    label: string;
    value: ReactNode;
};

/**
 * I cinque numeri in cima alle schede di report e intervento (stato, prezzi, pagamento; stato,
 * tipo, data e orari).
 *
 * Da `xl` restano una fila di card, una per numero. Sotto diventano una card sola con una riga
 * per voce, etichetta a sinistra e valore a destra: prima erano card da due per riga con il
 * valore a 24px, e su un telefono da 390px occupavano metà schermo prima dei dati veri.
 *
 * Una markup sola che cambia forma con le classi, non due blocchi mostrati e nascosti a
 * seconda della larghezza: così ogni valore compare una volta sola nel DOM, per i lettori di
 * schermo e per i test che lo cercano.
 */
const DetailStats = ({ items }: { items: DetailStat[] }) => (
    <dl className="divide-y divide-border rounded-xl bg-card text-card-foreground shadow-xs ring-1 ring-foreground/10 xl:grid xl:grid-cols-5 xl:gap-4 xl:divide-y-0 xl:rounded-none xl:bg-transparent xl:shadow-none xl:ring-0">
        {items.map((item) => (
            <div
                key={item.label}
                data-slot="detail-stat"
                className="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5 xl:flex-col xl:items-start xl:justify-start xl:gap-2 xl:rounded-xl xl:bg-card xl:px-6 xl:py-5 xl:shadow-xs xl:ring-1 xl:ring-foreground/10"
            >
                <dt className="shrink-0 text-sm text-muted-foreground">{item.label}</dt>
                <dd className="min-w-0 text-right text-sm font-semibold wrap-break-word xl:text-left xl:text-xl">
                    {item.value}
                </dd>
            </div>
        ))}
    </dl>
);

/**
 * Lo stato fra i numeri in alto. Sotto `xl` la voce è una riga di testo a 14px e il badge
 * grande (24px) la sovrastava; da `xl` resta un po' più grande dei valori, ma non quanto prima.
 * La misura `lg` tiene fuori il pallino, che nella card stretta spingeva la parola oltre il bordo.
 */
const DetailStatBadge = ({ color, children }: { color: StatusColor; children: ReactNode }) => (
    <StatusBadge size="lg" color={color} className="px-2.5 py-0.5 text-sm xl:px-3 xl:py-1 xl:text-lg">
        {children}
    </StatusBadge>
);

export { DetailStatBadge };
export default DetailStats;
