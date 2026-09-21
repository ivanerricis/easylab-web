#!/usr/bin/env bash
# For the Proxmox VM (production/LAN mode).
# Menu interattivo che raggruppa gli script ad uso manuale di scripts/*.sh, cosi'
# non serve ricordarsi nome e argomenti di ognuno. Non include check-updates.sh e
# update-server.sh: quelli li lancia systemd (vedi ops/systemd/), non vanno lanciati a mano.
# Uso: scripts/vm-menu.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pause() {
    echo ""
    read -r -p "Premi invio per tornare al menu..." _
}

ask_yes_no() {
    # ask_yes_no "domanda" default(s/n) -> ritorna 0 se si
    local prompt="$1" default="$2" reply
    if [ "$default" = "s" ]; then
        read -r -p "$prompt [S/n]: " reply
        [[ ! "$reply" =~ ^[nN] ]]
    else
        read -r -p "$prompt [s/N]: " reply
        [[ "$reply" =~ ^[sSyY] ]]
    fi
}

do_edit_env() {
    "$SCRIPT_DIR/edit-env.sh"
}

do_static_ip() {
    "$SCRIPT_DIR/configure-static-ip.sh"
}

do_start_server() {
    if ask_yes_no "Ricostruire le immagini Docker (docker compose up --build)?" s; then
        "$SCRIPT_DIR/start-server.sh"
    else
        "$SCRIPT_DIR/start-server.sh" --no-build
    fi
}

do_install_tunnel() {
    # install-tunnel.sh richiede root; sudo su un utente gia' root non chiede nulla.
    sudo "$SCRIPT_DIR/install-tunnel.sh"
}

do_install_updater() {
    sudo "$SCRIPT_DIR/install-updater.sh"
}

do_reset_password() {
    local username args=()
    read -r -p "Username [admin]: " username
    args+=(--username "${username:-admin}")
    if ask_yes_no "Disattivare anche la verifica in due passaggi (--reset-2fa)?" n; then
        args+=(--reset-2fa)
    fi
    "$SCRIPT_DIR/reset-admin-password.sh" "${args[@]}"
}

do_restore_db() {
    local dump_path args=()
    read -r -p "Percorso backup (vuoto = usa l'ultimo trovato in BACKUP_HOST_DIR): " dump_path
    if [ -n "$dump_path" ]; then
        args+=(--dump-path "$dump_path")
    fi
    if ask_yes_no "Azzerare lo schema del database prima del restore (--reset-database)?" n; then
        args+=(--reset-database)
    fi
    "$SCRIPT_DIR/restore-db.sh" "${args[@]}"
}

show_menu() {
    echo ""
    echo "==================================================="
    echo " EasyLab - Menu operazioni VM"
    echo "==================================================="
    echo " 1) Modifica configurazione (.env)"
    echo " 2) Configura IP statico"
    echo " 3) Avvia/riavvia i container"
    echo " 4) Configura dominio pubblico (Cloudflare Tunnel)"
    echo " 5) Installa aggiornamenti automatici"
    echo " 6) Reset password utente"
    echo " 7) Ripristina backup database"
    echo " 0) Esci"
    echo "==================================================="
}

while true; do
    show_menu
    read -r -p "Scelta: " choice
    case "$choice" in
        1) do_edit_env; pause ;;
        2) do_static_ip; pause ;;
        3) do_start_server; pause ;;
        4) do_install_tunnel; pause ;;
        5) do_install_updater; pause ;;
        6) do_reset_password; pause ;;
        7) do_restore_db; pause ;;
        0) exit 0 ;;
        *) echo "Scelta non valida." ;;
    esac
done
