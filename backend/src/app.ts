/**
 * L'app Express, senza avviarla: middleware, guardie e router nell'ordine in cui girano.
 *
 * Sta separata da `index.ts` (dotenv, `listen`, scheduler, spegnimento) perché l'ordine qui
 * sotto è una decisione di sicurezza — quali rotte restano aperte, quali chiedono sessione,
 * password cambiata, 2FA configurata o permessi di amministratore — e va verificato da un
 * test (`app.test.ts`), che non può importare un modulo che occupa la porta 3000 appena caricato.
 */
import express from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import path from "node:path";
import reportsRouter from "./routes/reports";
import customersRouter from "./routes/customers";
import collaboratorsRouter from "./routes/collaborators";
import techniciansRouter from "./routes/technicians";
import devicesRouter from "./routes/devices";
import issuesRouter from "./routes/issues";
import reportTechniciansRouter from "./routes/reportTechnicians";
import interventionsRouter from "./routes/interventions";
import notificationsRouter from "./routes/notifications";
import authRouter from "./routes/auth";
import usersRouter from "./routes/users";
import { userActionLogger } from "./middleware/userActionLogger";
import { errorHandler } from "./middleware/errorHandler";
import {
    requireAdmin,
    requireAuth,
    requirePasswordChangeCompleted,
    requireTwoFactorSetupCompleted,
} from "./middleware/requireAuth";
import settingsRouter from "./routes/settings";
import { getLogoFile } from "./services/logoManager";
import { requestLogger } from "./middleware/requestLogger";
import { parseAllowedOrigins, requireSameOrigin } from "./middleware/requireSameOrigin";

const app = express();

// `trust proxy` non può restare `true`: significherebbe accettare come veritiero
// qualunque `X-Forwarded-For` in arrivo, e quindi lasciar scegliere al chiamante quale IP
// far vedere al limitatore dei tentativi di login. L'unico hop di cui ci fidiamo è nginx
// del container frontend, che è anche l'unico a poter raggiungere il backend. L'IP reale
// del client si ricava da `CF-Connecting-IP` (vedi middleware/clientIp.ts).
app.set("trust proxy", 1);
app.use(requestLogger);

// In produzione frontend e backend sono la stessa origin — nginx fa da proxy su /api e
// /assets — quindi non esiste nessuna richiesta cross-origin e il CORS non serve: non
// attivarlo è più sicuro che configurarlo, e toglie di mezzo l'unico valore che sarebbe
// andato aggiornato a ogni cambio di dominio. Resta attivabile in sviluppo, dove Vite gira
// su :5173 e chiama il backend su :3000, elencando le origin ammesse in CORS_ORIGIN.
const corsOrigins = parseAllowedOrigins();

if (corsOrigins.length) {
    app.use(cors({ origin: corsOrigins, credentials: true }));
}

app.use(compression());
app.use(express.json());
app.use(cookieParser());
/**
 * Il logo è l'unica risorsa caricata dagli utenti che l'app restituisce così com'è, e fra i
 * formati ammessi c'è l'SVG, che qui non viene rasterizzato per non perdere la resa
 * vettoriale nell'app (per PDF ed email lo converte in PNG `loadPrintableLogo`). Un SVG
 * però può contenere `<script>`: dentro un `<img>` non viene
 * eseguito, ma aprendo direttamente questo URL il browser lo tratta come un documento, e
 * quel documento sta sulla stessa origin dell'app - potrebbe quindi chiamare /api/* con la
 * sessione di chi lo apre. I due header qui sotto chiudono la strada senza rinunciare
 * all'SVG:
 *
 * - `sandbox` (senza allow-scripts) toglie l'esecuzione di script al documento risultante;
 *   sulle richieste fatte da un `<img>` non ha effetto, perché lì non nasce un documento;
 * - `Content-Disposition: attachment` fa scaricare il file invece di aprirlo, ma vale solo
 *   per la navigazione diretta: i browser lo ignorano sulle sottorisorse, quindi il logo
 *   continua a comparire regolarmente in sidebar, in anteprima e nei PDF.
 */
app.get("/assets/logo.jpg", async (_req, res) => {
    const { filePath, mimeType } = await getLogoFile();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.setHeader("Content-Disposition", 'attachment; filename="logo"');
    res.type(mimeType);
    res.sendFile(filePath);
});
app.use("/assets", express.static(path.join(process.cwd(), "public")));
app.use(userActionLogger);
// Dopo il registro delle azioni, così un tentativo respinto vi resta annotato; prima di ogni
// router, login compreso. Vedi middleware/requireSameOrigin.ts.
app.use("/api", requireSameOrigin);

app.get("/api/health", (_, res) => {
    res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);

app.use("/api", requireAuth, requirePasswordChangeCompleted, requireTwoFactorSetupCompleted);

app.use("/api/users", requireAdmin, usersRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/customers", customersRouter);
app.use("/api/collaborators", collaboratorsRouter);
app.use("/api/technicians", techniciansRouter);
app.use("/api/devices", devicesRouter);
app.use("/api/issues", issuesRouter);
app.use("/api/report-technicians", reportTechniciansRouter);
app.use("/api/interventions", interventionsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/settings", settingsRouter);

app.use(errorHandler);

export default app;
