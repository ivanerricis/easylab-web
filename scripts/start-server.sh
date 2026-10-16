#!/usr/bin/env bash
# For the Proxmox VM (production; reached from outside via the Cloudflare Tunnel, no direct LAN access).
# Usage: scripts/start-server.sh [--no-build]
set -euo pipefail

NO_BUILD=false
if [ "${1:-}" = "--no-build" ]; then
    NO_BUILD=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

echo ""
echo "Avvio container Docker..."

if [ "$NO_BUILD" = true ]; then
    docker compose up -d
else
    docker compose up --build -d
fi

echo ""
echo "Container avviati con successo."

# Non si entra più dall'IP della VM: nessun container pubblica porte sull'host, l'unico
# ingresso è il dominio pubblico servito da Cloudflare Tunnel.
PUBLIC_DOMAIN="$(grep -E '^PUBLIC_DOMAIN=' .env 2>/dev/null | cut -d= -f2- || true)"

if [ -n "$PUBLIC_DOMAIN" ]; then
    echo "Indirizzo di collegamento: https://$PUBLIC_DOMAIN"
    echo ""
    echo "Se il sito non risponde, controlla lo stato del tunnel con:"
    echo "  docker compose logs -f cloudflared"
else
    echo "Nessun dominio configurato: esegui prima 'sudo scripts/install-tunnel.sh'."
fi
