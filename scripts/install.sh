#!/usr/bin/env bash
# Installazione guidata di EasyLab su una macchina Debian/Ubuntu nuova (VM o CT Proxmox).
#
#   curl -fsSL https://raw.githubusercontent.com/ivanerricis/easylab-web/main/scripts/install.sh | sudo bash
#
# oppure, da un clone già presente: sudo scripts/install.sh
#
# Fa in un colpo solo i passi del server che prima erano sette comandi a mano: prerequisiti,
# clone dell'ultima versione firmata, `.env` con una password del database generata, dominio
# pubblico (Cloudflare Tunnel), avvio, aggiornamenti automatici. Alla fine stampa la password
# dell'amministratore: il resto (dati del laboratorio, email, backup) si configura dall'app.
#
# Si può rilanciare senza danni: ciò che esiste già (clone, .env, tunnel) non viene toccato.
set -euo pipefail

# Tutto dentro una funzione: con `curl | bash` la shell legge lo script dallo stdin, e lo
# script deve essere letto per intero prima di riassegnare lo stdin al terminale.
main() {
    local REPO_URL="${EASYLAB_REPO_URL:-https://github.com/ivanerricis/easylab-web.git}"
    local INSTALL_DIR="${EASYLAB_DIR:-/opt/easylab-web}"

    if [ "$(id -u)" -ne 0 ]; then
        echo "Esegui questo script con sudo/root." >&2
        exit 1
    fi

    # Le domande (dominio, aggiornamenti) leggono dal terminale anche quando lo script arriva da una pipe.
    if [ ! -t 0 ]; then
        if ! exec </dev/tty 2>/dev/null; then
            echo "Serve un terminale interattivo: scarica lo script ed eseguilo con sudo." >&2
            exit 1
        fi
    fi

    echo ""
    echo "Installazione di EasyLab in $INSTALL_DIR"

    install_prerequisites
    clone_release "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"

    write_env "$INSTALL_DIR"

    echo ""
    read -r -p "Configurare ora il dominio pubblico (Cloudflare Tunnel)? [S/n]: " answer
    case "${answer,,}" in
        n|no) echo "Dominio saltato: potrai farlo dopo con 'sudo scripts/install-tunnel.sh'." ;;
        *) ./scripts/install-tunnel.sh ;;
    esac

    ./scripts/start-server.sh

    echo ""
    ./scripts/install-updater.sh

    print_admin_credentials
}

install_prerequisites() {
    echo ""
    echo "Controllo dei prerequisiti..."

    local missing=()
    for pair in git:git jq:jq ssh-keygen:openssh-client curl:curl; do
        command -v "${pair%%:*}" >/dev/null 2>&1 || missing+=("${pair##*:}")
    done

    if [ "${#missing[@]}" -gt 0 ]; then
        echo "Installo: ${missing[*]}"
        apt-get update -y
        apt-get install -y "${missing[@]}" ca-certificates
    fi

    if ! command -v docker >/dev/null 2>&1; then
        echo ""
        echo "Docker non è installato. Lo installo con lo script ufficiale di Docker (get.docker.com)."
        read -r -p "Procedo? [S/n]: " answer
        case "${answer,,}" in
            n|no) echo "Installa Docker Engine e rilancia lo script." >&2; exit 1 ;;
        esac
        curl -fsSL https://get.docker.com | sh
    fi

    docker compose version >/dev/null 2>&1 || {
        echo "Manca il plugin 'docker compose'. Installa docker-compose-plugin e rilancia lo script." >&2
        exit 1
    }
}

# Mette il repository sull'ultima versione firmata. Non basta clonare `main`: lo script di
# aggiornamento rifiuta di procedere se il commit installato non è antenato della prossima
# versione, e `main` può essere avanti all'ultimo tag.
clone_release() {
    local url="$1" dir="$2"

    if [ -d "$dir/.git" ]; then
        echo "Repository già presente in $dir, lo uso così com'è."
        return
    fi

    if [ -e "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
        echo "$dir esiste e non è vuota: sceglila diversa con EASYLAB_DIR o svuotala." >&2
        exit 1
    fi

    echo ""
    echo "Scarico EasyLab..."
    git clone --quiet "$url" "$dir"

    # Stessa regola dell'aggiornamento: solo un tag vX.Y.Z con firma valida di una chiave in
    # ops/allowed_signers (quella del repository appena clonato).
    local tag
    tag="$(
        cd "$dir"
        # shellcheck disable=SC1091
        REPO_ROOT="$dir"
        . scripts/update-status-lib.sh
        latest_signed_release_tag "$dir/ops/allowed_signers"
    )" || {
        echo "Nessuna versione firmata trovata nel repository: interrompo l'installazione." >&2
        exit 1
    }

    git -C "$dir" -c advice.detachedHead=false checkout --quiet "refs/tags/$tag"
    echo "Versione $tag (firma verificata)."
}

# Crea il `.env` solo se manca: la password del database vive lì, e cambiarla su un database
# già creato lo renderebbe inaccessibile. Quella generata qui non la vede mai nessuno.
write_env() {
    local dir="$1" env_path="$1/.env"

    if [ -f "$env_path" ]; then
        echo ".env già presente, non lo modifico."
        return
    fi

    local password
    password="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"

    mkdir -p "$dir/backups"
    umask 077
    cat > "$env_path" <<ENVEOF
# Generato da scripts/install.sh. Per modificarlo: scripts/edit-env.sh
POSTGRES_USER=easylab
POSTGRES_PASSWORD=$password
POSTGRES_DB=easylab_db
BACKUP_HOST_DIR=$dir/backups
PUBLIC_DOMAIN=

LAB_NAME=EasyLab
LAB_EMAIL=info@easylab.local
LAB_ADDRESS=Indirizzo laboratorio
LAB_PHONE=+39 000 000 0000
ENVEOF
    umask 022
    echo ".env creato con una password del database generata."
}

print_admin_credentials() {
    echo ""
    echo "Attendo la creazione dell'utente amministratore..."

    local content="" attempt
    for attempt in $(seq 1 60); do
        content="$(docker compose exec -T backend cat /app/data/initial-admin-password.txt 2>/dev/null || true)"
        [ -n "$content" ] && break
        sleep 2
    done

    local domain
    domain="$(grep -E '^PUBLIC_DOMAIN=' .env | cut -d= -f2- || true)"

    echo ""
    echo "============================================================"
    echo "EasyLab è installato."
    if [ -n "$domain" ]; then
        echo "Indirizzo: https://$domain"
    else
        echo "Dominio non ancora configurato: 'sudo scripts/install-tunnel.sh'."
    fi
    if [ -n "$content" ]; then
        echo ""
        echo "Primo accesso:"
        echo "$content" | sed 's/^/  /'
        echo ""
        echo "Al primo accesso l'app chiede una nuova password e la verifica in due"
        echo "passaggi: tieni il telefono a portata di mano. Poi dalla dashboard la"
        echo "guida \"Primi passi\" porta a dati del laboratorio, email e backup."
    else
        echo ""
        echo "Password dell'amministratore non ancora disponibile: controlla"
        echo "  docker compose logs backend | grep -A3 \"Utente amministratore\""
    fi
    echo "============================================================"
}

main "$@"
