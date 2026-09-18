import { Router } from "express";
import { z } from "zod";
import { createIssue, deleteIssueById, getIssueById, listIssues, updateIssueById } from "../db/queries/issue";
import { ApiError } from "../services/apiError";
import { catchAllIssueDescription, isCatchAllIssueDescription } from "../services/issueCatalog";
import { createCrudRouter, idParamsSchema } from "./crudRouter";
import { validate } from "./validation";

const issueCreateBodySchema = z
    .object({
        description: z.string().trim().min(1).max(255),
    })
    .strict();

const issueUpdateBodySchema = issueCreateBodySchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
});

const protectedIssueError = () =>
    new ApiError(
        `Il difetto "${catchAllIssueDescription}" non si può eliminare né rinominare: è quello che fa ` +
            "comparire la casella con cui si descrive il problema sul report, e quel testo è l'unico che " +
            "finisce sulla ricevuta del cliente.",
        409
    );

/**
 * Le due strade da cui la voce generica potrebbe sparire: rinominarla o eliminarla.
 *
 * Vengono registrate prima delle rotte generate dal factory, che in Express vince il primo
 * match: qui si controlla e si passa oltre con `next()`, così la logica CRUD resta una sola.
 *
 * Il doppione ("altro" accanto ad "Altro", creato o ottenuto rinominando un'altra voce) qui non
 * si controlla più: dalla migration 0031 lo rifiuta l'indice unico su `lower(description)`, con
 * il messaggio di `errorHandler`. Il controllo a mano esisteva perché il vincolo di prima
 * distingueva le maiuscole, e dopo la 0031 era rimasto come seconda copia della stessa regola.
 */
const protectCatchAllIssue = (router: Router) => {
    router.put("/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
        const { id } = req.params as unknown as { id: number };
        const description = (req.body as { description?: unknown }).description;

        if (typeof description !== "string") {
            next();
            return;
        }

        const [issue] = await getIssueById(id);

        if (!issue) {
            next();
            return;
        }

        if (isCatchAllIssueDescription(issue.description) && !isCatchAllIssueDescription(description)) {
            throw protectedIssueError();
        }

        next();
    });

    router.delete("/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
        const { id } = req.params as unknown as { id: number };
        const [issue] = await getIssueById(id);

        if (issue && isCatchAllIssueDescription(issue.description)) {
            throw protectedIssueError();
        }

        next();
    });
};

const issuesRouter = createCrudRouter({
    notFoundMessage: "Issue not found",
    createBodySchema: issueCreateBodySchema,
    updateBodySchema: issueUpdateBodySchema,
    extraRoutes: protectCatchAllIssue,
    queries: {
        list: listIssues,
        getById: getIssueById,
        create: createIssue,
        update: updateIssueById,
        remove: deleteIssueById,
    },
});

export default issuesRouter;
