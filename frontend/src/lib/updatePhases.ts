import type { UpdateBuildDto } from "@/lib/api";

// Stesso ordine delle fasi scritte da scripts/update-server.sh: vedi UpdatePhase in
// backend/src/services/updateManager.ts. Sta qui perché lo usano sia il pannello che lancia
// l'aggiornamento sia il poller di ogni altra scheda.
export const updatePhaseSteps = [
    { key: "verify", label: "Verifica della firma del commit" },
    { key: "code", label: "Aggiornamento del codice" },
    { key: "build", label: "Ricostruzione dei container" },
    { key: "cleanup", label: "Pulizia delle immagini vecchie" },
];

/**
 * La riga sotto l'elenco delle fasi mentre i container si ricostruiscono ("backend, passo 5 di
 * 9: RUN npm ci"). Solo nella fase `build` e solo se lo script dell'host ha scritto l'avanzamento:
 * altrimenti `undefined` e l'overlay resta quello di sempre.
 */
export const buildProgressDetail = (phase: string | null | undefined, build: UpdateBuildDto | null | undefined) =>
    phase === "build" && build
        ? `${build.service}, passo ${build.step} di ${build.total}${build.name ? `: ${build.name}` : ""}`
        : undefined;
