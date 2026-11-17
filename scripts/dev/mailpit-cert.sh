#!/usr/bin/env bash
# Crea il certificato TLS con cui Mailpit (docker-compose.dev.yml) risponde in sviluppo.
#
# Serve perché `emailManager.buildTransporter` pretende TLS con certificato verificato
# (`requireTLS`, `rejectUnauthorized` di default): è la difesa contro chi toglie l'annuncio di
# STARTTLS e legge la password SMTP, e non va allentata per lo sviluppo. Qui si crea quindi una
# piccola CA di prova, che solo il backend di sviluppo conosce (`NODE_EXTRA_CA_CERTS` nel compose),
# e un certificato per il nome `mailpit` firmato da lei.
#
# I file finiscono in scripts/dev/certs/, ignorata da git: chiavi di prova, ma pur sempre chiavi.
# Va lanciato una volta, prima di `docker compose -f docker-compose.dev.yml up -d`.
set -euo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/certs"
mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

# Git Bash convertirebbe "/CN=..." in un percorso Windows.
export MSYS_NO_PATHCONV=1

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=masso-web dev CA" \
    -keyout mailpit-ca.key -out mailpit-ca.crt
openssl req -newkey rsa:2048 -nodes -subj "/CN=mailpit" -keyout mailpit.key -out mailpit.csr
printf "subjectAltName=DNS:mailpit,DNS:localhost\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n" >ext.cnf
openssl x509 -req -in mailpit.csr -CA mailpit-ca.crt -CAkey mailpit-ca.key -CAcreateserial \
    -days 3650 -extfile ext.cnf -out mailpit.crt
rm -f mailpit.csr ext.cnf mailpit-ca.srl

openssl verify -CAfile mailpit-ca.crt mailpit.crt
