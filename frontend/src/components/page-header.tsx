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

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
