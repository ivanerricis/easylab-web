// Stesso ordine delle fasi scritte da scripts/update-server.sh: vedi UpdatePhase in
// backend/src/services/updateManager.ts. Sta qui perché lo usano sia il pannello che lancia
// l'aggiornamento sia il poller di ogni altra scheda.
export const updatePhaseSteps = [
    { key: "verify", label: "Verifica della firma del commit" },
    { key: "code", label: "Aggiornamento del codice" },
    { key: "build", label: "Ricostruzione dei container" },
    { key: "cleanup", label: "Pulizia delle immagini vecchie" },
];
