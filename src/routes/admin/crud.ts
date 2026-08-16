import { Router } from "express";
import { asc, eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "../../db/index.js";

/**
 * One CRUD router, built once, mounted per table.
 *
 * Six admin resources need the same five operations with the same rules —
 * list ordered by sort, create, update, delete, reorder. Writing that six
 * times is six chances to forget the validation on one of them.
 *
 * Each resource supplies a Zod schema, and that schema is the only thing
 * standing between the request body and the database.
 */

type CrudOptions<TSchema extends z.ZodTypeAny> = {
  table: PgTable & { id: never };
  schema: TSchema;
  /** Column the list is ordered by. Almost always `sort`. */
  orderColumn?: unknown;
  /** Which paths to rebuild on the public site after a change. */
  revalidatePaths?: string[];
};

export function crudRouter<TSchema extends z.ZodTypeAny>(
  options: CrudOptions<TSchema>,
  onChange?: () => void,
) {
  const router = Router();
  const table = options.table as never as Record<string, never>;
  const idColumn = table["id"];
  const orderColumn = options.orderColumn ?? table["sort"] ?? idColumn;

  router.get("/", async (_req, res) => {
    const rows = await db
      .select()
      .from(options.table)
      .orderBy(asc(orderColumn as never));
    res.json({ items: rows });
  });

  router.post("/", async (req, res) => {
    const parsed = options.schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        error: "Some fields need attention",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const [row] = await db
      .insert(options.table)
      .values(parsed.data as never)
      .returning();

    onChange?.();
    res.status(201).json({ item: row });
  });

  router.patch("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Bad id" });
      return;
    }

    /* Partial, so a form that edits one field does not have to resend the
       other twelve — and cannot blank them by omission. */
    const parsed = (options.schema as unknown as z.ZodObject<z.ZodRawShape>)
      .partial()
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(422).json({
        error: "Some fields need attention",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const [row] = await db
      .update(options.table)
      .set({ ...(parsed.data as object), updatedAt: new Date() } as never)
      .where(eq(idColumn as never, id))
      .returning();

    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    onChange?.();
    res.json({ item: row });
  });

  router.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Bad id" });
      return;
    }

    const [row] = await db
      .delete(options.table)
      .where(eq(idColumn as never, id))
      .returning();

    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    onChange?.();
    res.json({ ok: true });
  });

  /**
   * Reorder in one request rather than one PATCH per row. Dragging a card to
   * the top of a list of six should not fire six requests, five of which can
   * fail independently and leave the order half-applied.
   */
  router.post("/reorder", async (req, res) => {
    const parsed = z.object({ ids: z.array(z.number().int()) }).safeParse(req.body);

    if (!parsed.success) {
      res.status(422).json({ error: "Expected a list of ids" });
      return;
    }

    await db.transaction(async (tx) => {
      for (const [index, id] of parsed.data.ids.entries()) {
        await tx
          .update(options.table)
          .set({ sort: index, updatedAt: new Date() } as never)
          .where(eq(idColumn as never, id));
      }
    });

    onChange?.();
    res.json({ ok: true });
  });

  void sql;
  return router;
}