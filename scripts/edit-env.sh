#!/usr/bin/env bash
# For the Proxmox VM (production/LAN mode).
# Usage: scripts/edit-env.sh [--configure-ufw]
# Al termine chiede anche se impostare un IP statico (scripts/configure-static-ip.sh).
set -euo pipefail

CONFIGURE_UFW=false
if [ "${1:-}" = "--configure-ufw" ]; then
    CONFIGURE_UFW=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_PATH="$REPO_ROOT/.env"

declare -a KEYS=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB BACKUP_HOST_DIR PUBLIC_DOMAIN LAB_NAME LAB_EMAIL LAB_ADDRESS LAB_PHONE LAB_LOGO_TEXT)
declare -A DEFAULTS=(
    [POSTGRES_USER]="easylab"
    [POSTGRES_PASSWORD]="easylab_password"
    [POSTGRES_DB]="easylab_db"
    [BACKUP_HOST_DIR]="/opt/easylab-web/backups"
    [PUBLIC_DOMAIN]=""
    [LAB_NAME]="EasyLab"
    [LAB_EMAIL]="info@easylab.local"
    [LAB_ADDRESS]="Indirizzo laboratorio"
    [LAB_PHONE]="+39 000 000 0000"
    [LAB_LOGO_TEXT]="EasyLab"
)
declare -A CURRENT=()
declare -A NEW=()

if [ -f "$ENV_PATH" ]; then
    while IFS='=' read -r key value; do
        [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
        CURRENT["$key"]="$value"
    done < "$ENV_PATH"
fi

echo ""
echo "Editor interattivo del file .env"
echo "Percorso: $ENV_PATH"
echo ""

for key in "${KEYS[@]}"; do
    label="${CURRENT[$key]:-${DEFAULTS[$key]}}"
    read -r -p "$key [$label]: " input
    if [ -z "$input" ]; then
        NEW["$key"]="$label"
    else
        NEW["$key"]="$input"
    fi
done

{
    echo "# Shared / production-like configuration"
    for key in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB BACKUP_HOST_DIR PUBLIC_DOMAIN; do
        echo "$key=${NEW[$key]}"
    done
    echo ""
    for key in LAB_NAME LAB_EMAIL LAB_ADDRESS LAB_PHONE LAB_LOGO_TEXT; do
        echo "$key=${NEW[$key]}"
    done
} > "$ENV_PATH"

echo ""
echo ".env aggiornato: $ENV_PATH"

if [ "$CONFIGURE_UFW" = true ]; then
    echo ""
    echo "Configurazione firewall (ufw)..."
    # Con Cloudflare Tunnel non serve nessuna porta in ingresso: è cloudflared ad aprire
    # la connessione verso l'esterno. Restano aperte solo quelle già consentite (SSH).
    if command -v ufw >/dev/null 2>&1; then
        echo "Nessuna porta in ingresso da aprire: l'accesso passa da Cloudflare Tunnel."
        ufw status || true
    else
        echo "ufw non trovato. Nessuna porta in ingresso è comunque necessaria."
    fi
fi

echo ""
read -r -p "Vuoi impostare un indirizzo IP statico per questa VM? [s/N]: " CONFIGURE_STATIC_IP
if [[ "$CONFIGURE_STATIC_IP" =~ ^[sSyY] ]]; then
    "$SCRIPT_DIR/configure-static-ip.sh"
fi
