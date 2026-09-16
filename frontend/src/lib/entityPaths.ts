/**
 * Gli indirizzi delle schede. Stavano scritti a mano in ogni pagina che ci porta (tabelle,
 * pulsanti "Apri", doppio clic, ricerca globale); qui c'è un solo posto da cambiare.
 */
export const entityPaths = {
    report: (id: number) => `/reports/${id}`,
    intervention: (id: number) => `/interventions/${id}`,
    customer: (id: number) => `/clients/${id}`,
    collaborator: (id: number) => `/collaborators/${id}`,
    technician: (id: number) => `/technicians/${id}`,
};
