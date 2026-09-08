#!/usr/bin/env bash
# For the Proxmox VM (production/LAN mode).
# Rigenera la password di un utente quando nessuno riesce più ad accedere all'app
# (es. unico utente rimasto e password persa) senza toccare il resto dei dati.
# Usage: scripts/reset-admin-password.sh [--username nome] [--reset-2fa]
set -euo pipefail

USERNAME="admin"
RESET_2FA=""

while [ $# -gt 0 ]; do
    case "$1" in
        --username)
            USERNAME="$2"
            shift 2
            ;;
        # Da usare solo quando anche il secondo fattore è irraggiungibile (telefono perso e
        # codici di recupero finiti): senza, la 2FA resta e la nuova password non basta.
        --reset-2fa)
            RESET_2FA="--reset-2fa"
            shift
            ;;
        *)
            echo "Argomento sconosciuto: $1" >&2
            exit 1
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"

echo ""
echo "Reset password utente"
echo "Compose file: $COMPOSE_FILE"
echo "Utente: $USERNAME"
if [ -n "$RESET_2FA" ]; then
    echo "Verifica in due passaggi: verrà disattivata"
fi
echo ""

read -r -p "Digita RESET per continuare: " confirmation
if [ "$confirmation" != "RESET" ]; then
    echo "Operazione annullata."
    exit 1
fi

docker compose -f "$COMPOSE_FILE" exec -T backend node reset-admin-password.js "$USERNAME" $RESET_2FA
