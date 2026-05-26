import {Router, type Response} from "express";
import bcrypt from "bcrypt";
import {z} from "zod";
import {db, type UserRow} from "../db.js";
import {bearerAuth, buildSession, type AuthedRequest} from "../middleware/auth.js";
import {authLimiter} from "../middleware/rateLimit.js";

export const authRouter = Router();

const BCRYPT_COST = 12;

const credentialsSchema = z.object({
  username: z
    .string()
    .min(4, "username-too-short")
    .max(32, "username-too-long")
    .regex(/^[A-Za-z0-9_-]+$/, "username-invalid-chars"),
  password: z
    .string()
    .min(8, "password-too-short")
    .max(128, "password-too-long"),
});

function publicUser(row: UserRow): {
  id: number;
  username: string;
  createdAt: number;
  lastLoginAt: number | null;
} {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

authRouter.post("/register", authLimiter, async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({error: "invalid-credentials", details: parsed.error.flatten()});
    return;
  }
  const {username, password} = parsed.data;

  const existing = db
    .prepare<[string], {id: number}>(`SELECT id FROM users WHERE username = ?`)
    .get(username);
  if (existing) {
    res.status(409).json({error: "username-taken"});
    return;
  }

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const now = Date.now();
  const result = db
    .prepare(
      `INSERT INTO users (username, password_hash, created_at, last_login_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(username, hash, now, now);
  const userId = Number(result.lastInsertRowid);
  const user = db
    .prepare<[number], UserRow>(`SELECT * FROM users WHERE id = ?`)
    .get(userId)!;

  const {token, expiresAt} = buildSession(userId);
  res.status(201).json({token, expiresAt, user: publicUser(user)});
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: "invalid-credentials"});
    return;
  }
  const {username, password} = parsed.data;
  const user = db
    .prepare<[string], UserRow>(`SELECT * FROM users WHERE username = ?`)
    .get(username);
  if (!user) {
    res.status(401).json({error: "bad-credentials"});
    return;
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    res.status(401).json({error: "bad-credentials"});
    return;
  }
  const now = Date.now();
  db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(
    now,
    user.id,
  );
  const refreshed = {...user, last_login_at: now};
  const {token, expiresAt} = buildSession(user.id);
  res.json({token, expiresAt, user: publicUser(refreshed)});
});

authRouter.post("/logout", bearerAuth, (req: AuthedRequest, res: Response) => {
  if (req.sessionToken) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(req.sessionToken);
  }
  res.json({ok: true});
});

authRouter.get("/me", bearerAuth, (req: AuthedRequest, res: Response) => {
  res.json({user: publicUser(req.user!)});
});
