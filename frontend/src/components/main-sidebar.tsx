import { brandLogoUrl, brandName, brandSubtitle } from "@/lib/brand";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar";
import {
    BookOpen,
    BookUser,
    Bug,
    ClipboardList,
    HardHat,
    Laptop,
    LayoutDashboard,
    Settings,
    Users,
    Wrench,
    type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const DOCS_URL = "https://ivanerricis.github.io/easylab-web/";

type SidebarItem = {
    label: string;
    path: string;
    icon: LucideIcon;
};

const sidebarItems: SidebarItem[] = [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Report", path: "/reports", icon: ClipboardList },
    { label: "Interventi", path: "/interventions", icon: HardHat },
    { label: "Clienti", path: "/clients", icon: Users },
    { label: "Collaboratori", path: "/collaborators", icon: BookUser },
    { label: "Tecnici esterni", path: "/technicians", icon: Wrench },
    { label: "Dispositivi", path: "/devices", icon: Laptop },
    { label: "Difetti", path: "/issues", icon: Bug },
];

const isPathActive = (pathname: string, itemPath: string) => {
    if (pathname === itemPath) {
        return true;
    }

    return pathname.startsWith(`${itemPath}/`);
};

// Righe da 40px con testo 15px e icone 20px: un gradino sopra la scala base di
// `sidebarMenuButtonVariants` (14px/18px), che a 36px risultava un po' piccola per la voce di
// navigazione principale. Resta comunque ben sotto i vecchi 48px con testo a 18px, che facevano
// pesare la barra più del contenuto. Nella modalità a sole icone il riquadro è di 32px, quindi lì
// l'icona torna a 18px. Lo stile della voce aperta viene da `isActive` nel componente.
const menuButtonClassName =
    "h-10 text-[0.9375rem] [&_svg]:size-5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:[&_svg]:size-4.5";

/**
 * Le voci sono link (`<a>` tramite `Link`), non pulsanti che chiamano `navigate`: così si
 * possono aprire in un'altra scheda con Ctrl+clic o con la rotella, e copiarne l'indirizzo.
 * Un clic normale resta una navigazione interna. `aria-current="page"` dice a uno screen
 * reader quale voce è quella aperta, che finora si capiva solo dal colore.
 */
const MainSidebar = () => {
    const { pathname } = useLocation();
    const { setOpenMobile } = useSidebar();
    const isSettingsActive = pathname.startsWith("/settings");

    // Su mobile la barra è un pannello sopra la pagina: scelta una voce, si chiude.
    const closeMobile = () => setOpenMobile(false);

    return (
        <Sidebar collapsible="icon">
            {/* Stessa altezza dell'intestazione della pagina (`h-13` in MainLayout): sono
                affiancate e i due bordi inferiori devono risultare sulla stessa linea. */}
            <SidebarHeader className="h-13 justify-center border-b border-sidebar-border px-3 py-0 group-data-[collapsible=icon]:px-2">
                <SidebarMenuItem className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
                    <div className="flex size-8 items-center justify-center overflow-hidden rounded-sm border border-sidebar-border bg-background group-data-[collapsible=icon]:size-9">
                        <img src={brandLogoUrl} alt="Logo laboratorio" className="size-full object-cover" />
                    </div>

                    <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
                        <span className="text-sm font-semibold text-sidebar-foreground">{brandName}</span>
                        <span className="text-xs text-sidebar-foreground/70">{brandSubtitle}</span>
                    </div>
                </SidebarMenuItem>
            </SidebarHeader>

            <SidebarContent className="p-2">
                <SidebarMenu className="gap-0.5">
                    {sidebarItems.map((item) => {
                        const Icon = item.icon;
                        const active = isPathActive(pathname, item.path);

                        return (
                            <SidebarMenuItem key={item.path}>
                                <SidebarMenuButton
                                    asChild
                                    tooltip={item.label}
                                    isActive={active}
                                    className={menuButtonClassName}
                                >
                                    <Link
                                        to={item.path}
                                        onClick={closeMobile}
                                        aria-current={active ? "page" : undefined}
                                    >
                                        <Icon />
                                        <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    })}
                </SidebarMenu>
            </SidebarContent>

            <SidebarFooter className="border-t border-sidebar-border p-2">
                <SidebarMenu className="gap-0.5">
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild tooltip="Documentazione" className={menuButtonClassName}>
                            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                                <BookOpen />
                                <span className="group-data-[collapsible=icon]:hidden">Documentazione</span>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton
                            asChild
                            tooltip="Impostazioni"
                            isActive={isSettingsActive}
                            className={menuButtonClassName}
                        >
                            <Link
                                to="/settings"
                                onClick={closeMobile}
                                aria-current={isSettingsActive ? "page" : undefined}
                            >
                                <Settings />
                                <span className="group-data-[collapsible=icon]:hidden">Impostazioni</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
};

export default MainSidebar;
