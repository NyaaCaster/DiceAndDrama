import Database from "better-sqlite3";
import {mkdirSync} from "node:fs";
import {dirname} from "node:path";

const DB_PATH = process.env.CLOUDSAVE_DB_PATH ?? "/app/data/cloudsave.sqlite";

mkdirSync(dirname(DB_PATH), {recursive: true});

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saves (
    user_id INTEGER NOT NULL,
    app_id INTEGER NOT NULL,
    slot_id TEXT NOT NULL,
    label TEXT NOT NULL,
    data TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, app_id, slot_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (app_id) REFERENCES apps(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_saves_app_id ON saves(app_id);
`);

// Seed the dicedrama app row so PUT-without-prior-app still works for our
// own client. Other games' slugs are upserted lazily on first PUT (see
// routes/saves.ts).
db.prepare(
  `INSERT OR IGNORE INTO apps (slug, name, created_at) VALUES (?, ?, ?)`,
).run("dicedrama", "Dice & Drama", Date.now());

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: number;
  last_login_at: number | null;
}

export interface AppRow {
  id: number;
  slug: string;
  name: string;
  created_at: number;
}

export interface SaveRow {
  user_id: number;
  app_id: number;
  slot_id: string;
  label: string;
  data: string;
  version: number;
  updated_at: number;
}

export interface SessionRow {
  token: string;
  user_id: number;
  expires_at: number;
}

export function getOrCreateApp(slug: string): AppRow {
  const existing = db
    .prepare<[string], AppRow>(`SELECT * FROM apps WHERE slug = ?`)
    .get(slug);
  if (existing) return existing;
  const now = Date.now();
  // Default name = slug; the owning game can update it later out of band.
  db.prepare(
    `INSERT OR IGNORE INTO apps (slug, name, created_at) VALUES (?, ?, ?)`,
  ).run(slug, slug, now);
  return db
    .prepare<[string], AppRow>(`SELECT * FROM apps WHERE slug = ?`)
    .get(slug)!;
}
