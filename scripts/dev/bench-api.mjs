#!/usr/bin/env node
/**
 * Misura la latenza delle chiamate API sullo stack di sviluppo, dopo aver popolato il
 * database con `scripts/dev/seed-fake-data.sql`.
 *
 * Le richieste partono dall'host e passano dal port forward di Docker, quindi i tempi qui
 * sotto sono quelli che vede il browser meno il rendering: e' la stessa strada che fa il
 * frontend su http://localhost:5173.
 *
 * Uso:
 *   node scripts/dev/bench-api.mjs
 *   node scripts/dev/bench-api.mjs --iterations 20 --out C:\\percorso\\report.md
 *
 * L'autenticazione: lo script crea una sessione temporanea inserendo direttamente la riga
 * in `session` (il token viene salvato come sha256, quindi il cookie porta il valore in
 * chiaro e la tabella il suo hash) e la cancella alla fine, anche in caso di errore. Non
 * serve conoscere la password dell'utente e nessun dato dell'ambiente viene modificato.
 */

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const parseArgs = () => {
    const args = process.argv.slice(2);
    const options = {
        baseUrl: process.env.BENCH_API_URL ?? "http://localhost:3000/api",
        iterations: Number(process.env.BENCH_ITERATIONS ?? 12),
        warmup: Number(process.env.BENCH_WARMUP ?? 3),
        container: process.env.BENCH_DB_CONTAINER ?? "postgres_db_dev",
        dbUser: process.env.BENCH_DB_USER ?? "masso",
        dbName: process.env.BENCH_DB_NAME ?? "masso_db",
        out: process.env.BENCH_OUT ?? null,
    };

    for (let index = 0; index < args.length; index += 2) {
        const key = args[index]?.replace(/^--/, "");
        const value = args[index + 1];

        if (key === "url") options.baseUrl = value;
        else if (key === "iterations") options.iterations = Number(value);
        else if (key === "warmup") options.warmup = Number(value);
        else if (key === "out") options.out = value;
        else if (key === "container") options.container = value;
    }

    return options;
};

const options = parseArgs();

const psql = (sql) =>
    execFileSync("docker", [
        "exec",
        "-i",
        options.container,
        "psql",
        "-U",
        options.dbUser,
        "-d",
        options.dbName,
        "-t",
        "-A",
        "-c",
        sql,
    ])
        .toString()
        .trim();

const token = randomBytes(32).toString("hex");
const tokenHash = createHash("sha256").update(token).digest("hex");

const openSession = () => {
    const userId = psql(`select id from "user" where active = true order by id limit 1`);

    if (!userId) {
        throw new Error("Nessun utente attivo in tabella: impossibile creare la sessione di prova.");
    }

    psql(
        `insert into session (token_hash, user_id, expires_at) values ('${tokenHash}', ${Number(userId)}, now() + interval '6 hours')`
    );

    return Number(userId);
};

const closeSession = () => {
    try {
        psql(`delete from session where token_hash = '${tokenHash}'`);
    } catch (error) {
        console.error("Attenzione: la sessione di prova non e' stata rimossa.", error);
    }
};

const request = async (path, { method = "GET", body } = {}) => {
    const startedAt = performance.now();
    const response = await fetch(`${options.baseUrl}${path}`, {
        method,
        headers: {
            cookie: `session=${token}`,
            ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.arrayBuffer();

    return {
        ms: performance.now() - startedAt,
        status: response.status,
        bytes: payload.byteLength,
        text: () => Buffer.from(payload).toString("utf8"),
    };
};

const percentile = (sortedValues, fraction) =>
    sortedValues[Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(fraction * sortedValues.length) - 1))];

const summarize = (name, group, samples, { status, bytes, note }) => {
    const sorted = [...samples].sort((a, b) => a - b);

    return {
        name,
        group,
        status,
        bytes,
        note,
        runs: samples.length,
        min: sorted[0],
        p50: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        p95: percentile(sorted, 0.95),
        max: sorted[sorted.length - 1],
        avg: samples.reduce((total, value) => total + value, 0) / samples.length,
    };
};

const measure = async (name, group, path, extra = {}) => {
    for (let index = 0; index < options.warmup; index += 1) {
        await request(path, extra);
    }

    const samples = [];
    let last = null;

    for (let index = 0; index < options.iterations; index += 1) {
        last = await request(path, extra);
        samples.push(last.ms);
    }

    return summarize(name, group, samples, { status: last.status, bytes: last.bytes });
};

/** Misura il tempo complessivo di un gruppo di chiamate lanciate insieme, come fa una pagina al mount. */
const measureBundle = async (name, group, paths) => {
    for (let index = 0; index < options.warmup; index += 1) {
        await Promise.all(paths.map((path) => request(path)));
    }

    const samples = [];
    let bytes = 0;
    let status = 200;

    for (let index = 0; index < options.iterations; index += 1) {
        const startedAt = performance.now();
        const responses = await Promise.all(paths.map((path) => request(path)));
        samples.push(performance.now() - startedAt);
        bytes = responses.reduce((total, response) => total + response.bytes, 0);
        status = Math.max(...responses.map((response) => response.status));
    }

    return summarize(name, group, samples, {
        status,
        bytes,
        note: `${paths.length} chiamate in parallelo`,
    });
};

const formatMs = (value) => `${value.toFixed(1)}`;
const formatBytes = (value) =>
    value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(2)} MB` : `${(value / 1024).toFixed(1)} KB`;

const run = async () => {
    const userId = openSession();
    console.log(`Sessione di prova creata per l'utente id=${userId}. Base URL: ${options.baseUrl}`);
    console.log(`Iterazioni: ${options.iterations} (piu' ${options.warmup} di riscaldamento)\n`);

    const counts = JSON.parse(
        psql(
            `select json_build_object(
                'reports', (select count(*) from report),
                'customers', (select count(*) from customer),
                'interventions', (select count(*) from intervention),
                'devices', (select count(*) from device),
                'issues', (select count(*) from "issue"),
                'collaborators', (select count(*) from collaborator),
                'technicians', (select count(*) from technician)
            )`
        )
    );

    const sampleReportId = Number(psql(`select id from report order by created_at desc limit 1`));
    const sampleInterventionId = Number(psql(`select id from intervention order by created_at desc limit 1`));
    const sampleCustomerId = Number(psql(`select id from customer order by id desc limit 1`));
    const deepPage = Math.max(1, Math.floor(counts.reports / 10) - 5);
    const today = new Date();
    const isoDay = (date) => date.toISOString().slice(0, 10);
    const monthKey = isoDay(today).slice(0, 7);
    const dateFrom = isoDay(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    const dateTo = isoDay(today);

    const results = [];

    const scenarios = [
        ["Health check (senza auth)", "Base", "/health"],
        ["Sessione corrente", "Base", "/auth/me"],

        ["Report, pagina 1 x10 (aperti)", "Report", "/reports?page=1&pageSize=10"],
        ["Report, pagina 1 x50", "Report", "/reports?page=1&pageSize=50"],
        ["Report, pagina 1 x10 (tutti)", "Report", "/reports?page=1&pageSize=10&visibility=all"],
        [`Report, pagina ${deepPage} x10 (offset profondo)`, "Report", `/reports?page=${deepPage}&pageSize=10&visibility=all`],
        ["Report, ricerca testuale 'rossi'", "Report", "/reports?page=1&pageSize=10&visibility=all&search=rossi"],
        ["Report, ricerca su password 'pw12'", "Report", "/reports?page=1&pageSize=10&visibility=all&search=pw12"],
        ["Report, ricerca senza risultati", "Report", "/reports?page=1&pageSize=10&visibility=all&search=zzzqwx"],
        ["Report, ordina per cliente", "Report", "/reports?page=1&pageSize=10&visibility=all&sortBy=customer&sortOrder=asc"],
        ["Report, ordina per totale", "Report", "/reports?page=1&pageSize=10&visibility=all&sortBy=totalPrice&sortOrder=desc"],
        ["Report, filtro per data (2 mesi)", "Report", `/reports?page=1&pageSize=10&visibility=all&dateFrom=${dateFrom}&dateTo=${dateTo}`],
        [`Report, lista SENZA paginazione (${counts.reports} righe)`, "Report", "/reports"],
        ["Report, statistiche dashboard", "Report", `/reports/stats?month=${monthKey}`],
        ["Report, dettaglio per id", "Report", `/reports/${sampleReportId}`],
        ["Report, PDF di stampa", "PDF", `/reports/${sampleReportId}/print`],

        ["Clienti, pagina 1 x10", "Clienti", "/customers?page=1&pageSize=10"],
        ["Clienti, typeahead (search + x8)", "Clienti", "/customers?page=1&pageSize=8&search=ross"],
        [`Clienti, lista SENZA paginazione (${counts.customers} righe)`, "Clienti", "/customers"],
        ["Clienti, dettaglio per id", "Clienti", `/customers/${sampleCustomerId}`],

        ["Interventi, pagina 1 x10", "Interventi", "/interventions?page=1&pageSize=10"],
        ["Interventi, ricerca testuale", "Interventi", "/interventions?page=1&pageSize=10&search=stampante"],
        ["Interventi, filtro stato+tipo", "Interventi", "/interventions?page=1&pageSize=10&status=completato&type=intervento_sede"],
        ["Interventi, ordina per data", "Interventi", "/interventions?page=1&pageSize=10&sortBy=interventionDate&sortOrder=desc"],
        [`Interventi, lista SENZA paginazione (${counts.interventions} righe, calendario)`, "Interventi", "/interventions"],
        ["Interventi, statistiche dashboard", "Interventi", "/interventions/stats"],
        ["Interventi, dettaglio per id", "Interventi", `/interventions/${sampleInterventionId}`],
        ["Interventi, PDF di stampa", "PDF", `/interventions/${sampleInterventionId}/print`],

        [`Cataloghi: dispositivi (${counts.devices})`, "Cataloghi", "/devices"],
        [`Cataloghi: difetti (${counts.issues})`, "Cataloghi", "/issues"],
        [`Cataloghi: collaboratori (${counts.collaborators})`, "Cataloghi", "/collaborators"],
        [`Cataloghi: tecnici (${counts.technicians})`, "Cataloghi", "/technicians"],

        ["Notifiche", "Sistema", "/notifications"],
        ["Impostazioni azienda", "Sistema", "/settings/company"],
        ["Elenco utenti", "Sistema", "/users"],
        ["Elenco log", "Sistema", "/settings/logs"],
    ];

    for (const [name, group, path] of scenarios) {
        const result = await measure(name, group, path);
        results.push(result);
        console.log(
            `${result.status === 200 ? "ok " : "!! "} ${name.padEnd(52)} p50 ${formatMs(result.p50).padStart(8)} ms   p95 ${formatMs(result.p95).padStart(8)} ms   ${formatBytes(result.bytes)}`
        );
    }

    // Scritture: creano e rimuovono subito le righe di prova, così il database resta com'era.
    const writeScenarios = [
        {
            name: "Crea cliente (POST)",
            run: async () => {
                const response = await request("/customers", {
                    method: "POST",
                    body: {
                        firstName: "Bench",
                        lastName: `Prova ${Date.now()}`,
                        phoneNumber: "+39 3000000000",
                        city: "Napoli",
                    },
                });
                const created = JSON.parse(response.text());
                await request(`/customers/${created.id}`, { method: "DELETE" });

                return response;
            },
        },
        {
            name: "Crea report (POST)",
            run: async () => {
                const response = await request("/reports", {
                    method: "POST",
                    body: {
                        customerId: sampleCustomerId,
                        deviceId: 1,
                        issueId: 1,
                        issueDescription: "Prova di latenza",
                        price: 0,
                    },
                });
                const created = JSON.parse(response.text());
                await request(`/reports/${created.id}`, { method: "DELETE" });

                return response;
            },
        },
        {
            name: "Aggiorna report (PUT)",
            run: () => request(`/reports/${sampleReportId}`, { method: "PUT", body: { alerted: true } }),
        },
    ];

    for (const scenario of writeScenarios) {
        for (let index = 0; index < options.warmup; index += 1) {
            await scenario.run();
        }

        const samples = [];
        let last = null;

        for (let index = 0; index < options.iterations; index += 1) {
            last = await scenario.run();
            samples.push(last.ms);
        }

        const result = summarize(scenario.name, "Scritture", samples, { status: last.status, bytes: last.bytes });
        results.push(result);
        console.log(
            `${result.status < 300 ? "ok " : "!! "} ${scenario.name.padEnd(52)} p50 ${formatMs(result.p50).padStart(8)} ms   p95 ${formatMs(result.p95).padStart(8)} ms`
        );
    }

    const bundles = [
        [
            "Apertura Dashboard",
            ["/reports/stats?month=" + monthKey, "/interventions/stats", "/interventions"],
        ],
        ["Apertura pagina Report", ["/reports?page=1&pageSize=10"]],
        ["Apertura dialog 'Nuovo report'", ["/devices", "/issues", "/customers?page=1&pageSize=8"]],
        ["Apertura dialog 'Nuovo intervento'", ["/collaborators", "/customers?page=1&pageSize=8"]],
        ["Apertura pagina Clienti", ["/customers?page=1&pageSize=10"]],
        ["Apertura pagina Interventi", ["/interventions?page=1&pageSize=10"]],
    ];

    for (const [name, paths] of bundles) {
        const result = await measureBundle(name, "Pagine", paths);
        results.push(result);
        console.log(
            `ok  ${name.padEnd(52)} p50 ${formatMs(result.p50).padStart(8)} ms   p95 ${formatMs(result.p95).padStart(8)} ms   ${formatBytes(result.bytes)}`
        );
    }

    const lines = [
        "# Latenza API - stack di sviluppo",
        "",
        `Misurato il ${new Date().toLocaleString("it-IT")} da host verso ${options.baseUrl}.`,
        `${options.iterations} richieste per scenario (piu' ${options.warmup} di riscaldamento), sequenziali.`,
        "",
        "Volumi nel database:",
        "",
        ...Object.entries(counts).map(([table, count]) => `- ${table}: ${count}`),
        "",
        "| Gruppo | Chiamata | p50 (ms) | p95 (ms) | max (ms) | Payload | Stato |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
        ...results.map(
            (result) =>
                `| ${result.group} | ${result.name} | ${formatMs(result.p50)} | ${formatMs(result.p95)} | ${formatMs(result.max)} | ${formatBytes(result.bytes)} | ${result.status} |`
        ),
        "",
        "## Le dieci chiamate piu' lente (p95)",
        "",
        "| Chiamata | p95 (ms) | Payload |",
        "| --- | ---: | ---: |",
        ...[...results]
            .sort((a, b) => b.p95 - a.p95)
            .slice(0, 10)
            .map((result) => `| ${result.name} | ${formatMs(result.p95)} | ${formatBytes(result.bytes)} |`),
        "",
    ];

    const report = lines.join("\n");

    if (options.out) {
        writeFileSync(options.out, report, "utf8");
        console.log(`\nReport scritto in ${options.out}`);
    }

    console.log("\n--- Le dieci chiamate piu' lente (p95) ---");
    [...results]
        .sort((a, b) => b.p95 - a.p95)
        .slice(0, 10)
        .forEach((result, index) => {
            console.log(
                `${String(index + 1).padStart(2)}. ${result.name.padEnd(52)} ${formatMs(result.p95).padStart(9)} ms   ${formatBytes(result.bytes)}`
            );
        });

    return results;
};

try {
    await run();
} finally {
    closeSession();
}
