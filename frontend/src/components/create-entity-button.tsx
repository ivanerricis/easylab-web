import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PlusCircle } from "lucide-react";
import type { ComponentProps } from "react";

type CreateEntityButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
    label: string;
    onClick: NonNullable<ComponentProps<typeof Button>["onClick"]>;
};

const CreateEntityButton = ({ label, size = "lg", className, ...props }: CreateEntityButtonProps) => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button size={size} className={cn("text-lg", className)} aria-label={label} {...props}>
                    <PlusCircle className="size-5" />
                    <span className="hidden text-lg md:inline">{label}</span>
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
};

export default CreateEntityButton;
