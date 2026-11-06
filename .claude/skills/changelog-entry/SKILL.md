---
name: changelog-entry
description: Come si scrive una voce di CHANGELOG di masso-web (indice in docs/CHANGELOG.md, testo in docs/changelog/AAAA-MM.md). Da usare ogni volta che si completa una modifica tecnica, un fix o un miglioramento.
---

# Voce di CHANGELOG

Ogni intervento tecnico va documentato **insieme alla modifica**, non dopo. Il "perché" è la parte che non si ricostruisce dal diff né dal messaggio di commit.

## Dove

- `docs/CHANGELOG.md` è **solo l'indice**: una riga per voce, le più recenti in cima alla sezione del periodo:
  `- [AAAA-MM-GG — Titolo](changelog/AAAA-MM.md#slug)`
- Il testo sta in `docs/changelog/AAAA-MM.md`. In cima al file del periodo corrente: `## AAAA-MM-GG — Titolo`, il testo, poi `---` di separazione dalla voce precedente.
- Un mese che supera circa 2.000 righe si divide per decadi (`AAAA-MM-01-10.md`, `-11-20`, `-21-30`).
- Periodo nuovo: file nuovo, sezione nell'indice e voce in `nav` di `mkdocs.yml`.
- Gli altri documenti si linkano come `../BACKLOG.md` dentro i file del mese.

## Slug del link

È quello di `markdown.extensions.toc.slugify(titolo, "-")`: minuscolo, accenti tolti, la "—" sparisce, la punteggiatura diventa trattini. Verificare con `python -m mkdocs build --strict` (dipendenze in `docs/requirements.txt`): un link rotto fa fallire la build.

## Contenuto

In **italiano**, come il resto della documentazione. Forma:

```
## AAAA-MM-GG — Titolo breve

**Cosa.** Cosa cambia per chi usa l'app, o cosa è cambiato nel codice.

**Perché.** Il vincolo o il problema reale che l'ha motivata, non la descrizione del codice.

**Come.** Solo se la scelta tecnica non è ovvia (alternative scartate, trappole).

**File.** `percorso/file.ts`, ...
```

- Annotare anche le **non-modifiche**: cose verificate che erano già a posto, con il motivo per cui la segnalazione era sbagliata. Evita di rifare la stessa analisi.
- Se più modifiche vanno insieme in una PR e in una release, possono stare in una voce sola con sezioni in grassetto.
- Se la modifica cambia lo schema, la voce cita anche il diagramma delle classi (skill `schema-change`).
- Il lavoro rimandato va in `docs/BACKLOG.md`; quando è fatto passa nel CHANGELOG.

## Trappole

- I file `docs/` hanno terminazioni di riga **CRLF**. `Edit` su più righe può non trovare il testo: ancorarsi a una riga sola, oppure controllare con `file`. Git normalizza (`autocrlf`), ma non mischiare stili dentro la stessa voce senza controllare con `git diff`.
- La CI controlla la documentazione con `mkdocs build --strict` (workflow `docs.yml`): lanciarlo in locale prima del push se si è toccato un link.
