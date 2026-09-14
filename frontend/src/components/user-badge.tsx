import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/components/use-auth";
import { getApiErrorMessage } from "@/lib/api";
import ChangePasswordDialog from "@/components/dialogs/settings/changePasswordDialog";

const getInitials = (username: string) => username.trim().slice(0, 2).toUpperCase();

export function UserBadge() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

    if (!user) {
        return null;
    }

    const handleLogout = async () => {
        try {
            await logout();
            // Niente `state.from`: dopo un logout esplicito il prossimo login (magari di un
            // altro utente, specie su un'app installata condivisa) deve atterrare sulla
            // dashboard, non riaprire la pagina su cui ci si trovava.
            navigate("/login", { replace: true });
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile disconnettersi"));
        }
    };

    return (
        <>
            <DropdownMenu>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon-lg" aria-label="Account utente">
                                <span className="text-sm font-semibold">{getInitials(user.username)}</span>
                            </Button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{user.username}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal text-muted-foreground">
                        Accesso come <span className="font-semibold text-foreground">{user.username}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsChangePasswordOpen(true)}>
                        <KeyRound className="size-4" />
                        Cambia password
                    </DropdownMenuItem>
                    {user.isAdmin ? (
                        <DropdownMenuItem onClick={() => navigate("/settings?section=users")}>
                            <Users className="size-4" />
                            Gestisci utenti
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void handleLogout()}>
                        <LogOut className="size-4" />
                        Esci
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <ChangePasswordDialog open={isChangePasswordOpen} onOpenChange={setIsChangePasswordOpen} />
        </>
    );
}
