import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/use-auth";

/**
 * La card di una sezione delle impostazioni mentre arriva: intestazione con titolo e descrizione
 * (stessa struttura di `SettingsCard`) e due righe di campi con etichetta. Serve sia mentre arriva
 * il codice della sezione (`Suspense` di `SettingsPage`) sia, dentro `SettingsPageSkeleton`, al
 * posto della sezione.
 */
export const SettingsSectionSkeleton = ({ label = "Caricamento sezione..." }: { label?: string }) => (
    <Card size="sm" role="status" aria-busy="true" className="border-primary/15 shadow-sm">
        <span className="sr-only">{label}</span>
        <CardHeader aria-hidden="true" className="-mt-4 border-b border-primary/10 bg-muted/20 pt-4">
            <div className="grid gap-1">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-[19px] w-72 max-w-full max-sm:hidden" />
            </div>
        </CardHeader>
        <CardContent aria-hidden="true" className="grid gap-3">
            {Array.from({ length: 2 }, (_, row) => (
                <div key={row} className="grid gap-3 @lg:grid-cols-2">
                    {Array.from({ length: 2 }, (_, field) => (
                        <div key={field} className="grid content-start gap-2">
                            <Skeleton className="h-5 w-28" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                    ))}
                </div>
            ))}
        </CardContent>
    </Card>
);

// Quante voci ha ogni gruppo del menu (Preferenze, Laboratorio, Dati e sistema) per un
// amministratore; chi non lo è vede solo Preferenze, con due voci.
const adminNavGroups = [2, 3, 4];
const userNavGroups = [2];

/**
 * Impostazioni mentre ne arriva il codice: sotto `xl` il solo selettore, da `xl` il menu a gruppi
 * (stesse classi di `SettingsPage`), e a fianco la card della sezione.
 */
const SettingsPageSkeleton = () => {
    const { user } = useAuth();
    const navGroups = user?.isAdmin ? adminNavGroups : userNavGroups;

    return (
        <div
            role="status"
            aria-busy="true"
            className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto xl:flex-row xl:overflow-visible"
        >
            <span className="sr-only">Caricamento delle impostazioni</span>
            <Skeleton aria-hidden="true" className="h-9 w-full xl:hidden" />

            <div
                aria-hidden="true"
                className="hidden max-h-full w-56 shrink-0 self-start overflow-y-auto rounded-2xl border bg-card p-2 shadow-sm xl:block"
            >
                <div className="grid gap-3">
                    {navGroups.map((items, group) => (
                        <div key={group} className="not-first:border-t not-first:pt-3">
                            <Skeleton className="mx-3 mb-1.5 h-4 w-20" />
                            <div className="grid gap-0.5">
                                {Array.from({ length: items }, (_, item) => (
                                    <div key={item} className="flex h-9 items-center gap-3 px-3">
                                        <Skeleton className="size-4 shrink-0" />
                                        <Skeleton className="h-4 w-24" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="@container min-w-0 flex-1 overflow-y-auto">
                <SettingsSectionSkeleton />
            </div>
        </div>
    );
};

export default SettingsPageSkeleton;
