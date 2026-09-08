import { Router, type Response } from "express";
import { z, type ZodType } from "zod";
import { validate } from "./validation";
import { maxPageSize } from "../db/queries/pagination";

export const idParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(maxPageSize).optional(),
    search: z.string().trim().max(255).optional(),
    sortBy: z.string().trim().max(64).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type ListParams = {
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
};

// Le query di lista restituiscono un array semplice quando non è richiesta la
// paginazione, altrimenti items + totale.
export type ListResult<TRow> = TRow[] | { items: TRow[]; totalItems: number };

export const sendListResponse = <TRow>(res: Response, result: ListResult<TRow>, page?: number, pageSize?: number) => {
    if (page == null || pageSize == null || Array.isArray(result)) {
        res.json(result);
        return;
    }

    const { items, totalItems } = result;

    res.json({
        items,
        totalItems,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    });
};

type CrudQueries<TRow, TCreate, TUpdate> = {
    list: (params: ListParams) => PromiseLike<ListResult<TRow>>;
    getById: (id: number) => PromiseLike<TRow[]>;
    create: (data: TCreate) => PromiseLike<TRow[]>;
    update: (id: number, data: TUpdate) => PromiseLike<TRow[]>;
    remove: (id: number) => PromiseLike<TRow[]>;
};

type CreateCrudRouterOptions<TRow, TCreate, TUpdate> = {
    /** Messaggio 404, già nella lingua attesa dal client. */
    notFoundMessage: string;
    queries: CrudQueries<TRow, TCreate, TUpdate>;
    createBodySchema: ZodType;
    updateBodySchema: ZodType;
    /**
     * Rotte specifiche dell'entità. Vengono registrate prima di `/:id` perché in
     * Express vince il primo match: un percorso letterale come `/print` altrimenti
     * verrebbe catturato dal parametro.
     */
    extraRoutes?: (router: Router) => void;
};

export const createCrudRouter = <TRow, TCreate, TUpdate>({
    notFoundMessage,
    queries,
    createBodySchema,
    updateBodySchema,
    extraRoutes,
}: CreateCrudRouterOptions<TRow, TCreate, TUpdate>): Router => {
    const router = Router();

    router.get("/", validate({ query: listQuerySchema }), async (req, res) => {
        const { page, pageSize, search, sortBy, sortOrder } = req.query as unknown as ListParams;

        sendListResponse(res, await queries.list({ page, pageSize, search, sortBy, sortOrder }), page, pageSize);
    });

    extraRoutes?.(router);

    router.get("/:id", validate({ params: idParamsSchema }), async (req, res) => {
        const { id } = req.params as unknown as { id: number };
        const rows = await queries.getById(id);

        if (rows.length === 0) {
            res.status(404).json({ message: notFoundMessage });
            return;
        }

        res.json(rows[0]);
    });

    router.post("/", validate({ body: createBodySchema }), async (req, res) => {
        const created = await queries.create(req.body as TCreate);

        res.status(201).json(created[0]);
    });

    router.put("/:id", validate({ params: idParamsSchema, body: updateBodySchema }), async (req, res) => {
        const { id } = req.params as unknown as { id: number };
        const updated = await queries.update(id, req.body as TUpdate);

        if (updated.length === 0) {
            res.status(404).json({ message: notFoundMessage });
            return;
        }

        res.json(updated[0]);
    });

    router.delete("/:id", validate({ params: idParamsSchema }), async (req, res) => {
        const { id } = req.params as unknown as { id: number };
        const deleted = await queries.remove(id);

        if (deleted.length === 0) {
            res.status(404).json({ message: notFoundMessage });
            return;
        }

        res.json(deleted[0]);
    });

    return router;
};
