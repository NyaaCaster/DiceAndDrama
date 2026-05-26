import type {Request, Response, NextFunction} from "express";
import {BLESSING} from "../version.js";

// Embed the project signature into every response so it's grep-able from
// outside the container without reading source. See .docs/code-signature.md.
export function blessing(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Blessing", BLESSING);
  next();
}
