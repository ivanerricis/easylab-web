import { z } from "zod";
import { createIssue, deleteIssueById, getIssueById, listIssues, updateIssueById } from "../db/queries/issue";
import { createCrudRouter } from "./crudRouter";

const issueCreateBodySchema = z
    .object({
        description: z.string().trim().min(1).max(255),
    })
    .strict();

const issueUpdateBodySchema = issueCreateBodySchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: "È necessario specificare almeno un campo",
});

const issuesRouter = createCrudRouter({
    notFoundMessage: "Difetto non trovato",
    createBodySchema: issueCreateBodySchema,
    updateBodySchema: issueUpdateBodySchema,
    queries: {
        list: listIssues,
        getById: getIssueById,
        create: createIssue,
        update: updateIssueById,
        remove: deleteIssueById,
    },
});

export default issuesRouter;
