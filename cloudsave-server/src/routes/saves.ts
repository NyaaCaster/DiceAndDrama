import {Router, type Response} from "express";
import {z} from "zod";
import {db, getOrCreateApp, type SaveRow} from "../db.js";
import {bearerAuth, type AuthedRequest} from "../middleware/auth.js";

export const savesRouter = Router({mergeParams: true});

const slugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab");
const slotSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "slotId must be alphanumeric/-_");
const labelSchema = z.string().min(1).max(120);
const dataSchema = z.string().min(1).max(2 * 1024 * 1024);

const putBodySchema = z.object({
  label: labelSchema,
  data: dataSchema,
  baseVersion: z.number().int().nonnegative().optional(),
});

function publicSave(row: SaveRow): {
  slotId: string;
  label: string;
  data: string;
  version: number;
  updatedAt: number;
  sizeBytes: number;
} {
  return {
    slotId: row.slot_id,
    label: row.label,
    data: row.data,
    version: row.version,
    updatedAt: row.updated_at,
    sizeBytes: Buffer.byteLength(row.data, "utf8"),
  };
}

function publicSlotSummary(row: SaveRow): {
  slotId: string;
  label: string;
  version: number;
  updatedAt: number;
  sizeBytes: number;
} {
  return {
    slotId: row.slot_id,
    label: row.label,
    version: row.version,
    updatedAt: row.updated_at,
    sizeBytes: Buffer.byteLength(row.data, "utf8"),
  };
}

// GET /v1/apps/:slug/slots — list summaries for current user (no full data).
savesRouter.get(
  "/apps/:slug/slots",
  bearerAuth,
  (req: AuthedRequest, res: Response) => {
    const slug = slugSchema.parse(req.params.slug);
    const app = getOrCreateApp(slug);
    const rows = db
      .prepare<[number, number], SaveRow>(
        `SELECT * FROM saves WHERE user_id = ? AND app_id = ?
         ORDER BY updated_at DESC`,
      )
      .all(req.user!.id, app.id);
    res.json({slots: rows.map(publicSlotSummary)});
  },
);

// GET /v1/apps/:slug/slots/:slotId — full save payload.
savesRouter.get(
  "/apps/:slug/slots/:slotId",
  bearerAuth,
  (req: AuthedRequest, res: Response) => {
    const slug = slugSchema.parse(req.params.slug);
    const slotId = slotSchema.parse(req.params.slotId);
    const app = getOrCreateApp(slug);
    const row = db
      .prepare<[number, number, string], SaveRow>(
        `SELECT * FROM saves WHERE user_id = ? AND app_id = ? AND slot_id = ?`,
      )
      .get(req.user!.id, app.id, slotId);
    if (!row) {
      res.status(404).json({error: "slot-not-found"});
      return;
    }
    res.json({slot: publicSave(row)});
  },
);

// PUT /v1/apps/:slug/slots/:slotId — upsert with optional optimistic concurrency.
//
// If `baseVersion` is provided and does not match the row currently on disk,
// we return 409 + the current row so the client can resolve the conflict
// (e.g. show a "your other device just saved" prompt). If `baseVersion` is
// omitted, last-write-wins.
savesRouter.put(
  "/apps/:slug/slots/:slotId",
  bearerAuth,
  (req: AuthedRequest, res: Response) => {
    const slug = slugSchema.parse(req.params.slug);
    const slotId = slotSchema.parse(req.params.slotId);
    const parsed = putBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({error: "invalid-payload", details: parsed.error.flatten()});
      return;
    }
    const {label, data, baseVersion} = parsed.data;
    const app = getOrCreateApp(slug);
    const userId = req.user!.id;
    const now = Date.now();

    const tx = db.transaction(() => {
      const current = db
        .prepare<[number, number, string], SaveRow>(
          `SELECT * FROM saves WHERE user_id = ? AND app_id = ? AND slot_id = ?`,
        )
        .get(userId, app.id, slotId);

      if (current && baseVersion !== undefined && current.version !== baseVersion) {
        return {conflict: true as const, current};
      }

      const nextVersion = current ? current.version + 1 : 1;
      db.prepare(
        `INSERT INTO saves (user_id, app_id, slot_id, label, data, version, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, app_id, slot_id) DO UPDATE SET
           label = excluded.label,
           data = excluded.data,
           version = excluded.version,
           updated_at = excluded.updated_at`,
      ).run(userId, app.id, slotId, label, data, nextVersion, now);

      const written = db
        .prepare<[number, number, string], SaveRow>(
          `SELECT * FROM saves WHERE user_id = ? AND app_id = ? AND slot_id = ?`,
        )
        .get(userId, app.id, slotId)!;
      return {conflict: false as const, current: written};
    });

    const result = tx();
    if (result.conflict) {
      res.status(409).json({error: "version-conflict", current: publicSave(result.current)});
      return;
    }
    res.json({slot: publicSave(result.current)});
  },
);

// DELETE /v1/apps/:slug/slots/:slotId — drop a single slot for current user.
savesRouter.delete(
  "/apps/:slug/slots/:slotId",
  bearerAuth,
  (req: AuthedRequest, res: Response) => {
    const slug = slugSchema.parse(req.params.slug);
    const slotId = slotSchema.parse(req.params.slotId);
    const app = getOrCreateApp(slug);
    const result = db
      .prepare(
        `DELETE FROM saves WHERE user_id = ? AND app_id = ? AND slot_id = ?`,
      )
      .run(req.user!.id, app.id, slotId);
    if (result.changes === 0) {
      res.status(404).json({error: "slot-not-found"});
      return;
    }
    res.json({ok: true});
  },
);
