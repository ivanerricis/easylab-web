import CustomDialog from "@/components/dialogs/customDialog";
import CopyableValue from "@/components/dialogs/settings/copyableValue";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    username: string;
    password: string;
};

const GeneratedPasswordDialog = ({ open, onOpenChange, username, password }: Props) => (
    <CustomDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Password generata"
        description={`Questa password per "${username}" viene mostrata una sola volta: copiala ora e conservala in un posto sicuro. Al primo accesso verrà chiesto di impostarne una nuova.`}
        showCancelButton={false}
        confirmLabel="Ho copiato la password, chiudi"
        onConfirm={() => onOpenChange(false)}
        preventOutsideClose
        content={
            // `key` sul valore: il campo si ricorda se è già stato copiato, e riaprendo il
            // dialogo per un altro utente quello stato deve ripartire da zero.
            <CopyableValue
                key={password}
                id="generatedPassword"
                label="Password"
                value={password}
                copiedMessage="Password copiata negli appunti"
                errorMessage="Impossibile copiare la password"
            />
        }
    />
);

export default GeneratedPasswordDialog;
