#!/usr/bin/env bash
# Prova degli script di aggiornamento a tag (scripts/check-updates.sh, update-server.sh e la loro
# libreria), come girano sul server: root, git, jq e ssh-keygen. Costruisce un "origin" e un
# "server" in /t con chiavi di prova generate al momento, e un docker finto: non tocca niente di
# vero. Da lanciare da Linux o da un container, dalla radice del repository:
#
#   docker run --rm -v "$PWD:/src:ro" debian:12-slim bash /src/scripts/dev/test-updater.sh
#
# (da Windows, con MSYS_NO_PATHCONV=1 davanti). Con DEBUG=1 stampa l'output degli script.
# Scenari: nessuna novità, commit in main senza tag, tag firmato nuovo, tag con la chiave sbagliata
# o non firmato, aggiornamento al tag, stessa versione, server più avanti dell'ultimo tag, nessun
# tag valido, ops/allowed_signers mancante.
set -uo pipefail

apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq git jq openssh-client >/dev/null 2>&1
git config --global user.email test@example.com
git config --global user.name Test
git config --global init.defaultBranch main
git config --global core.autocrlf false
git config --global --add safe.directory '*'

T=/t; rm -rf $T; mkdir -p $T/bin; cd $T
ssh-keygen -q -t ed25519 -N "" -f key >/dev/null
ssh-keygen -q -t ed25519 -N "" -f evil >/dev/null

# Un docker e un systemctl finti: lo scenario prova la logica, non ricostruisce container.
printf '#!/bin/sh\necho "docker $*"\nexit 0\n' >bin/docker
printf '#!/bin/sh\necho inactive\nexit 3\n' >bin/systemctl
chmod +x bin/*; export PATH="$T/bin:$PATH"

pass=0; fail=0
ok() { pass=$((pass + 1)); echo "  ok   $1"; }
ko() { fail=$((fail + 1)); echo "  FAIL $1 (atteso: $2, trovato: $3)"; }
expect() { [ "$2" = "$3" ] && ok "$1" || ko "$1" "$2" "$3"; }

git init -q --bare origin.git
git clone -q origin.git dev 2>/dev/null
cd dev
mkdir -p scripts ops
for f in update-status-lib.sh check-updates.sh update-server.sh; do tr -d '\r' < /src/scripts/$f > scripts/$f; done
printf 'test@example.com namespaces="git" %s\n' "$(cut -d' ' -f1,2 $T/key.pub)" >ops/allowed_signers
echo v1 >app.txt; echo "services: {}" >docker-compose.yml
git add -A; git commit -q -m "release 1.0"
sign() { git -c gpg.format=ssh -c user.signingkey="$1" tag -s "$2" -m "$2" >/dev/null 2>&1; }
sign $T/key.pub v1.0.0
git push -q origin main --tags 2>/dev/null

cd $T; git clone -q origin.git server 2>/dev/null
SRV=$T/server
status() { jq -r "$1" $SRV/ops/update-status/status.json; }
run() { (cd $SRV && bash scripts/"$1" >$T/out.log 2>&1); rc=$?; [ -n "${DEBUG:-}" ] && sed "s/^/    | /" $T/out.log >&2; echo $rc; }

echo "A) server su v1.0.0, nessuna novità"
expect "check esce bene" 0 "$(run check-updates.sh)"
expect "versione installata" "v1.0.0" "$(status .currentVersion)"
expect "nessun aggiornamento" "false" "$(status .updateAvailable)"

echo "B) commit nuovo in main senza tag: non è un aggiornamento"
cd $T/dev; echo v2 >app.txt; git commit -qam "work after 1.0"; git push -q origin main 2>/dev/null
run check-updates.sh >/dev/null
expect "main avanti ma niente offerto" "false" "$(status .updateAvailable)"
expect "remoteVersion vuota" "null" "$(status .remoteVersion)"

echo "C) tag firmato v1.1.0: ora c'è un aggiornamento"
cd $T/dev; echo v3 >app.txt; git commit -qam "feature"; sign $T/key.pub v1.1.0; git push -q origin main --tags 2>/dev/null
run check-updates.sh >/dev/null
expect "disponibile" "true" "$(status .updateAvailable)"
expect "offre v1.1.0" "v1.1.0" "$(status .remoteVersion)"

echo "D) tag con la chiave sbagliata e tag non firmato: ignorati"
cd $T/dev; echo v4 >app.txt; git commit -qam "more"; sign $T/evil.pub v9.0.0; git tag -a v8.0.0 -m unsigned; git push -q origin main --tags 2>/dev/null
run check-updates.sh >/dev/null
expect "offre ancora v1.1.0" "v1.1.0" "$(status .remoteVersion)"

echo "E) aggiornamento al tag"
before=$(git -C $SRV rev-parse HEAD)
expect "update esce bene" 0 "$(run update-server.sh)"
expect "HEAD sul commit del tag" "$(git -C $T/dev rev-parse v1.1.0^{commit})" "$(git -C $SRV rev-parse HEAD)"
expect "non sul commit di main" "false" "$([ "$(git -C $SRV rev-parse HEAD)" = "$(git -C $T/dev rev-parse main)" ] && echo true || echo false)"
expect "stato success" "success" "$(status .lastUpdateStatus)"
expect "versione installata aggiornata" "v1.1.0" "$(status .currentVersion)"
expect "niente più aggiornamenti" "false" "$(status .updateAvailable)"
status .log | grep -q "docker compose up --build" && ok "ha ricostruito i container" || ko "ricostruzione" "si" "no"
[ "$before" != "$(git -C $SRV rev-parse HEAD)" ] && ok "il codice è cambiato" || ko "codice cambiato" "si" "no"

echo "F) riapplicare la stessa versione è permesso"
expect "update esce bene" 0 "$(run update-server.sh)"

echo "G) server più avanti dell'ultimo tag: nessun ritorno indietro"
git -C $SRV fetch -q --all 2>/dev/null; git -C $SRV reset -q --hard origin/main
ahead=$(git -C $SRV rev-parse HEAD)
expect "update rifiutato" 1 "$(run update-server.sh)"
expect "il codice non si è mosso" "$ahead" "$(git -C $SRV rev-parse HEAD)"
expect "stato failed" "failed" "$(status .lastUpdateStatus)"
echo "$(status .lastError)" | grep -q "più vecchia" && ok "messaggio chiaro" || ko "messaggio" "più vecchia" "$(status .lastError)"
run check-updates.sh >/dev/null
expect "non propone di tornare indietro" "false" "$(status .updateAvailable)"
expect "versione mostrata con i commit in più" "v1.1.0 + 1 commit" "$(status .currentVersion)"

echo "H) nessun tag firmato valido"
cd $T; rm -rf noserver origin2.git; git clone -q --bare origin.git origin2.git 2>/dev/null
git -C origin2.git for-each-ref --format='%(refname)' refs/tags | xargs -n1 git -C origin2.git update-ref -d
git clone -q origin2.git noserver 2>/dev/null; SRV=$T/noserver
expect "update rifiutato" 1 "$(run update-server.sh)"
echo "$(status .lastError)" | grep -q "Nessuna versione firmata" && ok "messaggio chiaro" || ko "messaggio" "Nessuna versione firmata" "$(status .lastError)"
expect "check non offre nulla" "false" "$(run check-updates.sh >/dev/null; status .updateAvailable)"

echo "I) manca ops/allowed_signers"
SRV=$T/server; rm -f $SRV/ops/allowed_signers
expect "update rifiutato" 1 "$(run update-server.sh)"
echo "$(status .lastError)" | grep -q "Manca ops/allowed_signers" && ok "messaggio chiaro" || ko "messaggio" "Manca ops/allowed_signers" "$(status .lastError)"

echo "J) avanzamento durante la ricostruzione"
cd $T; rm -rf progserver; git clone -q origin.git progserver 2>/dev/null; SRV=$T/progserver
git -C $SRV reset -q --hard v1.0.0
# Un docker lento che stampa righe come BuildKit: lo stato deve cambiare mentre gira, non solo alla fine.
printf '#!/bin/sh
echo "#11 [backend builder 2/9] RUN npm ci"
echo "#12 [frontend 5/7] RUN npm run build"
sleep 5
echo "#13 [backend stage-1 3/4] COPY dist"
sleep 4
exit 0
' >bin/docker
(cd $SRV && bash scripts/update-server.sh >$T/out.log 2>&1) &
sleep 6
expect "durante la build la fase � build" "build" "$(status .phase)"
expect "servizio in costruzione" "frontend" "$(status .build.service)"
expect "passo n" "5" "$(status .build.step)"
expect "passo m" "7" "$(status .build.total)"
status .log | grep -q "npm run build" && ok "il log si aggiorna durante la build" || ko "log durante la build" "si" "no"
wait
expect "a fine corsa success" "success" "$(status .lastUpdateStatus)"
expect "build azzerato a fine corsa" "null" "$(status .build)"

echo "K) la build fallisce: il ciclo si ferma e lo stato � failed"
git -C $SRV reset -q --hard v1.0.0
printf '#!/bin/sh
echo "#12 [backend 5/9] RUN boom"
sleep 4
exit 1
' >bin/docker
expect "update fallisce" 1 "$(run update-server.sh)"
expect "stato failed" "failed" "$(status .state)"
sleep 4
expect "lo stato resta failed (nessuno lo riscrive)" "failed" "$(status .state)"

echo
echo "RISULTATO: $pass ok, $fail falliti"
[ "$fail" -eq 0 ]
