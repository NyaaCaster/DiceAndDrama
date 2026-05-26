import type {Request, Response, NextFunction} from "express";
import {db, type UserRow} from "../db.js";

export interface AuthedRequest extends Request {
  user?: UserRow;
  sessionToken?: string;
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function bearerAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({error: "missing-bearer-token"});
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({error: "empty-bearer-token"});
    return;
  }

  const session = db
    .prepare<
      [string],
      {token: string; user_id: number; expires_at: number}
    >(`SELECT token, user_id, expires_at FROM sessions WHERE token = ?`)
    .get(token);

  if (!session) {
    res.status(401).json({error: "invalid-token"});
    return;
  }
  if (session.expires_at < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    res.status(401).json({error: "token-expired"});
    return;
  }

  const user = db
    .prepare<[number], UserRow>(`SELECT * FROM users WHERE id = ?`)
    .get(session.user_id);
  if (!user) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    res.status(401).json({error: "user-gone"});
    return;
  }

  req.user = user;
  req.sessionToken = token;
  next();
}

export function buildSession(userId: number): {
  token: string;
  expiresAt: number;
} {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = Buffer.from(tokenBytes).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
  ).run(token, userId, expiresAt);
  return {token, expiresAt};
}
