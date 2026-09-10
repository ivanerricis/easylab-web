import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { ReactNode } from "react";

type PageHeaderProps = {
    title: string;
    description: string;
    action?: ReactNode;
};

const PageHeader = ({ title, description, action }: PageHeaderProps) => {
    // Il titolo della pagina è già qui: da qui finisce anche nella barra delle schede,
    // senza che ogni pagina debba ripeterlo.
    useDocumentTitle(title);

    // Titolo e azione stanno sulla stessa riga anche su mobile, e vanno a capo solo se non ci
    // stanno. Prima sotto `sm` erano impilati (`flex-col`) per far posto ai tre pulsanti della
    // dashboard, ma in colonna ogni figlio si stira: il singolo "+" delle altre pagine
    // diventava una barra blu larga quanto lo schermo. Chi ha bisogno di una riga intera
    // (la dashboard) lo chiede dal proprio contenitore con `w-full sm:w-auto`.
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold">{title}</h1>
                    <p className="hidden text-muted-foreground md:block">{description}</p>
                </div>
                {action}
            </div>
        </div>
    );
};

export default PageHeader;
