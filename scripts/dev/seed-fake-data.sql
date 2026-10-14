-- Popolamento del database di sviluppo con dati fittizi, per provare l'app con volumi
-- realistici e misurare la latenza delle chiamate API (vedi scripts/dev/bench-api.mjs).
--
-- ATTENZIONE: cancella tutte le righe delle tabelle di dominio (report, intervention,
-- customer, ...). Non tocca "user" e "session", quindi le credenziali restano valide.
-- Da usare SOLO sullo stack di sviluppo, mai in produzione.
--
-- Uso:
--   docker exec -i postgres_db_dev psql -U masso -d masso_db -v ON_ERROR_STOP=1 \
--     < scripts/dev/seed-fake-data.sql
--
-- I volumi sono sovrascrivibili da riga di comando, ad esempio:
--   ... psql ... -v n_reports=100000 -v n_customers=20000 < scripts/dev/seed-fake-data.sql

\if :{?n_customers} \else \set n_customers 5000 \endif
\if :{?n_reports} \else \set n_reports 20000 \endif
\if :{?n_interventions} \else \set n_interventions 8000 \endif
\if :{?n_devices} \else \set n_devices 40 \endif
\if :{?n_issues} \else \set n_issues 60 \endif
\if :{?n_collaborators} \else \set n_collaborators 15 \endif
\if :{?n_technicians} \else \set n_technicians 12 \endif

\timing on

BEGIN;

-- Seme fisso: due esecuzioni con gli stessi volumi producono lo stesso database, così i
-- confronti di latenza prima/dopo una modifica restano paragonabili.
SELECT setseed(0.4242);

TRUNCATE report_technician, report, intervention, notification, "issue", device, collaborator, technician, customer
    RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------- anagrafiche di supporto

INSERT INTO device (id, name, created_at)
SELECT
    g,
    -- Marca e modello variano su due cifre indipendenti, così le prime 64 combinazioni sono
    -- uniche; oltre quella soglia il suffisso finale garantisce comunque il vincolo UNIQUE.
    (ARRAY['HP','Dell','Lenovo','Acer','Asus','Apple','MSI','Samsung'])[1 + ((g - 1) % 8)]
        || ' ' ||
        (ARRAY['Notebook 15','Notebook 14','Ultrabook 13','All-in-One 24','Desktop Tower',
               'Workstation 17','Convertibile 2-in-1','Mini PC'])[1 + (((g - 1) / 8) % 8)]
        || ' ' || (2018 + ((g - 1) % 8))::text
        || CASE WHEN g > 64 THEN ' v' || g::text ELSE '' END,
    now() - (random() * interval '900 days')
FROM generate_series(1, :n_devices) AS g;

INSERT INTO "issue" (id, description, created_at)
SELECT
    g,
    (ARRAY['Non si accende','Schermo rotto','Batteria non carica','Surriscaldamento',
           'Ventola rumorosa','Tastiera non funzionante','Wi-Fi assente','Disco pieno',
           'Sistema lentissimo','Schermata blu ricorrente','Porta USB danneggiata',
           'Audio assente','Touchpad bloccato','Cerniera schermo rotta','Virus e popup',
           'Aggiornamento fallito','Recupero dati richiesto','Password dimenticata',
           'Stampante non rilevata','Backup da configurare'])[1 + ((g - 1) % 20)]
        || ' - ' ||
        (ARRAY['all''accensione','dopo aggiornamento','in modo intermittente'])[1 + (((g - 1) / 20) % 3)]
        || CASE WHEN g > 60 THEN ' (' || g::text || ')' ELSE '' END,
    now() - (random() * interval '900 days')
FROM generate_series(1, :n_issues) AS g;

INSERT INTO collaborator (id, first_name, last_name, phone_number, created_at)
SELECT
    g,
    (ARRAY['Marco','Luca','Giuseppe','Antonio','Francesca','Chiara','Salvatore','Alessia',
           'Davide','Martina','Vincenzo','Elena','Simone','Giorgia','Raffaele'])[1 + ((g - 1) % 15)],
    (ARRAY['Esposito','Russo','Romano','Coppola','De Luca','Ferrara','Barbato','Sorrentino',
           'Improta','Amato','Cimmino','Guida','Marino','Palumbo','Vitale'])[1 + ((g * 7 - 1) % 15)],
    '+39 33' || lpad(((g::bigint * 918273) % 100000000)::text, 8, '0'),
    now() - (random() * interval '900 days')
FROM generate_series(1, :n_collaborators) AS g;

INSERT INTO technician (id, first_name, last_name, phone_number, vat_number, created_at)
SELECT
    g,
    (ARRAY['Gennaro','Pasquale','Rosario','Ciro','Nunzia','Ilaria','Carmine','Serena',
           'Fabio','Valeria','Domenico','Silvia'])[1 + ((g - 1) % 12)],
    (ARRAY['Borrelli','Capasso','Della Corte','Fiorillo','Gargiulo','Lombardi','Mazzella',
           'Napolitano','Pagano','Riccio','Scognamiglio','Tortora'])[1 + ((g * 5 - 1) % 12)],
    '+39 34' || lpad(((g::bigint * 776655) % 100000000)::text, 8, '0'),
    lpad(((g::bigint * 1234567) % 100000000000)::text, 11, '0'),
    now() - (random() * interval '900 days')
FROM generate_series(1, :n_technicians) AS g;

-- ------------------------------------------------------------------------------- clienti

INSERT INTO customer (id, first_name, last_name, phone_number, phone_number_secondary, email, city, created_at, updated_at)
SELECT
    g,
    (ARRAY['Mario','Anna','Giovanni','Maria','Roberto','Paola','Andrea','Silvia','Stefano',
           'Laura','Fabio','Rita','Alberto','Teresa','Enrico','Carla','Nicola','Sara',
           'Massimo','Federica'])[1 + ((g - 1) % 20)],
    (ARRAY['Rossi','Bianchi','Esposito','Russo','Ferrari','Romano','Colombo','Ricci','Marino',
           'Greco','Bruno','Gallo','Conti','De Luca','Mancini','Costa','Giordano','Rizzo',
           'Lombardi','Moretti','Barbieri','Fontana','Santoro','Mariani','Rinaldi','Caruso',
           'Ferrara','Galli','Martini','Leone','Longo','Gentile','Martinelli','Vitale',
           'Lombardo','Serra','Coppola','De Santis','D''Angelo','Marchetti'])[1 + ((g * 3 - 1) % 40)],
    -- g::bigint e non g: con molte migliaia di clienti il prodotto supera l'int a 32 bit.
    '+39 3' || lpad(((g::bigint * 314159) % 1000000000)::text, 9, '0'),
    CASE WHEN g % 4 = 0 THEN '+39 081' || lpad(((g::bigint * 271828) % 10000000)::text, 7, '0') END,
    CASE WHEN g % 6 <> 0 THEN
        lower(
            (ARRAY['mario','anna','giovanni','maria','roberto','paola','andrea','silvia','stefano',
                   'laura','fabio','rita','alberto','teresa','enrico','carla','nicola','sara',
                   'massimo','federica'])[1 + ((g - 1) % 20)]
            || '.' ||
            (ARRAY['rossi','bianchi','esposito','russo','ferrari','romano','colombo','ricci','marino',
                   'greco'])[1 + ((g * 3 - 1) % 10)]
            || g::text || '@' ||
            (ARRAY['gmail.com','libero.it','virgilio.it','outlook.it','tiscali.it'])[1 + (g % 5)]
        )
    END,
    (ARRAY['Napoli','Pozzuoli','Casoria','Portici','Marano di Napoli','Giugliano in Campania',
           'Quarto','Bacoli','Aversa','Caserta','Salerno','Torre del Greco','Castellammare di Stabia',
           'Afragola','Acerra','Nola','Ercolano','Cercola','Volla','Melito di Napoli',
           'Villaricca','Mugnano di Napoli','Calvizzano','Qualiano','Sant''Antimo'])[1 + ((g * 11 - 1) % 25)],
    now() - (random() * interval '1095 days'),
    CASE WHEN g % 7 = 0 THEN now() - (random() * interval '200 days') END
FROM generate_series(1, :n_customers) AS g;

-- ------------------------------------------------------------------------------- report

INSERT INTO report (
    id, note, password, issue_description, service_description,
    data_backup, charger, alerted, picked_up, closed, payment_method, price,
    created_at, updated_at, device_id, issue_id, collaborator_id, customer_id
)
SELECT
    g,
    CASE WHEN g % 3 <> 0 THEN
        (ARRAY['Cliente chiede preventivo prima di procedere','Consegnato senza borsa',
               'Ritiro previsto in settimana','Urgente, macchina di lavoro',
               'Gia'' passato da un altro centro','Garanzia scaduta a marzo',
               'Lasciato anche il mouse','Da richiamare al numero secondario'])[1 + (g % 8)]
    END,
    CASE WHEN g % 4 <> 0 THEN 'pw' || lpad((g % 10000)::text, 4, '0') END,
    (ARRAY['Non si avvia, resta sul logo','Rumore continuo dalla ventola',
           'Schermo con righe verticali','Batteria dura pochi minuti',
           'Si spegne dopo dieci minuti','Non rileva la rete Wi-Fi',
           'Errore di sistema all''avvio','Tasti che non rispondono',
           'Cerniera sinistra staccata','Molto lento nell''apertura dei programmi'])[1 + (g % 10)],
    CASE WHEN closed_flag THEN
        (ARRAY['Sostituita ventola e pasta termica','Reinstallato sistema operativo',
               'Sostituito SSD e ripristinati i dati','Sostituita batteria',
               'Pulizia interna e aggiornamento driver','Sostituito connettore alimentazione',
               'Sostituito schermo','Rimossi malware e ottimizzazione avvio'])[1 + (g % 8)]
    END,
    (g % 3 = 0),
    (g % 2 = 0),
    closed_flag AND (g % 5 <> 0),
    closed_flag AND (g % 4 <> 0),
    closed_flag,
    CASE
        WHEN NOT closed_flag THEN 'non_paid'
        WHEN g % 10 < 6 THEN 'cash'
        WHEN g % 10 < 9 THEN 'card'
        ELSE 'non_paid'
    END,
    CASE WHEN closed_flag THEN 20 + (random() * 380)::int ELSE 0 END,
    created,
    CASE WHEN closed_flag THEN created + (random() * interval '20 days') END,
    1 + (random() * (:n_devices - 1))::int,
    1 + (random() * (:n_issues - 1))::int,
    -- Un report chiuso ha sempre un collaboratore: e' la regola applicata dall'API.
    CASE WHEN closed_flag OR g % 3 = 0 THEN 1 + (random() * (:n_collaborators - 1))::int END,
    1 + (random() * (:n_customers - 1))::int
FROM generate_series(1, :n_reports) AS g
CROSS JOIN LATERAL (
    SELECT
        (g % 20) <> 0 AND random() < 0.72 AS closed_flag,
        -- random() elevato al quadrato addensa le date verso il presente: la maggior parte
        -- dei report e' recente, con una coda che arriva a tre anni fa.
        now() - (power(random(), 2) * interval '1095 days') AS created
) AS derived;

-- La chiave primaria e' il solo report_id: al massimo un tecnico esterno per report.
INSERT INTO report_technician (report_id, technician_id, price)
SELECT
    id,
    1 + ((id::bigint * 7) % :n_technicians),
    10 + ((id::bigint * 37) % 140)
FROM report
WHERE id % 5 < 2;

-- ------------------------------------------------------------------------- interventi

INSERT INTO intervention (
    id, type, description, problem, status,
    intervention_date, start_time, end_time,
    created_at, updated_at, customer_id, collaborator_id
)
SELECT
    g,
    tipo,
    (ARRAY['Consegna toner e risme di carta','Configurazione nuova postazione',
           'Assistenza sul gestionale','Sostituzione router','Installazione stampante di rete',
           'Migrazione posta elettronica','Controllo periodico backup',
           'Ripristino condivisione cartelle','Aggiornamento antivirus su tutte le postazioni',
           'Consegna notebook sostitutivo'])[1 + (g % 10)],
    CASE WHEN tipo <> 'material_delivery' THEN
        (ARRAY['La stampante di rete non risponde dalle postazioni del primo piano',
               'Il gestionale si blocca all''apertura degli ordini',
               'La posta non scarica dal client su due postazioni',
               'La linea cade piu'' volte al giorno',
               'Il backup notturno segnala errore da tre giorni'])[1 + (g % 5)]
    END,
    stato,
    data_intervento,
    CASE WHEN tipo <> 'material_delivery' THEN (time '08:00' + ((g % 9) * interval '1 hour')) END,
    CASE WHEN tipo <> 'material_delivery' THEN (time '08:00' + ((g % 9) * interval '1 hour') + interval '90 minutes') END,
    creato,
    CASE WHEN stato = 'completed' THEN creato + (random() * interval '10 days') END,
    1 + (random() * (:n_customers - 1))::int,
    1 + (random() * (:n_collaborators - 1))::int
FROM generate_series(1, :n_interventions) AS g
CROSS JOIN LATERAL (
    SELECT
        (ARRAY['material_delivery','customer_site','remote'])[1 + (g % 3)] AS tipo,
        now() - (power(random(), 2) * interval '730 days') AS creato
) AS base
CROSS JOIN LATERAL (
    SELECT
        -- Il 4% degli interventi cade nel futuro (agenda), e quelli restano "scheduled".
        (creato + CASE WHEN g % 25 = 0 THEN (random() * interval '30 days') + interval '1 day'
                       ELSE (random() * interval '5 days') END)::date AS data_intervento
) AS pianificazione
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN data_intervento > current_date THEN 'scheduled'
        WHEN g % 9 = 0 THEN 'in_progress'
        WHEN g % 11 = 0 THEN 'scheduled'
        ELSE 'completed'
    END AS stato
) AS avanzamento;

-- --------------------------------------------------------------------------- notifiche

INSERT INTO notification (dedupe_key, severity, title, message, link, occurrences, last_occurred_at, created_at)
VALUES
    ('backup:failed:smb', 'warning', 'Backup su SMB non riuscito',
     'La condivisione di rete non ha risposto durante il backup notturno.', '/settings', 3,
     now() - interval '9 hours', now() - interval '3 days'),
    ('update:available', 'info', 'E'' disponibile un aggiornamento',
     'Una nuova versione dell''applicazione e'' pronta per essere installata.', '/settings', 1,
     now() - interval '2 days', now() - interval '2 days'),
    ('email:test:failed', 'warning', 'Invio email di prova non riuscito',
     'Il server SMTP ha rifiutato le credenziali configurate.', '/settings', 2,
     now() - interval '5 days', now() - interval '6 days'),
    ('backup:ok:last', 'info', 'Backup completato',
     'Ultimo backup completato correttamente.', '/settings', 12,
     now() - interval '11 hours', now() - interval '40 days');

-- Le identity sono state riavviate dal TRUNCATE e gli id sono stati inseriti a mano:
-- senza questo passaggio la prima INSERT dall'app collide con la riga id = 1.
SELECT setval(pg_get_serial_sequence('customer', 'id'), (SELECT max(id) FROM customer));
SELECT setval(pg_get_serial_sequence('collaborator', 'id'), (SELECT max(id) FROM collaborator));
SELECT setval(pg_get_serial_sequence('technician', 'id'), (SELECT max(id) FROM technician));
SELECT setval(pg_get_serial_sequence('device', 'id'), (SELECT max(id) FROM device));
SELECT setval(pg_get_serial_sequence('issue', 'id'), (SELECT max(id) FROM "issue"));
SELECT setval(pg_get_serial_sequence('report', 'id'), (SELECT max(id) FROM report));
SELECT setval(pg_get_serial_sequence('intervention', 'id'), (SELECT max(id) FROM intervention));
SELECT setval(pg_get_serial_sequence('notification', 'id'), (SELECT max(id) FROM notification));

COMMIT;

-- Senza statistiche aggiornate il planner userebbe stime da tabella vuota e i tempi
-- misurati subito dopo il seed non direbbero nulla di utile.
ANALYZE;

SELECT relname AS tabella, n_live_tup AS righe
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC, relname;
