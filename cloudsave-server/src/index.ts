import express from "express";
import cors from "cors";
import {ZodError} from "zod";
import {BLESSING, SERVICE_NAME, SERVICE_VERSION} from "./version.js";
import {blessing} from "./middleware/blessing.js";
import {generalLimiter} from "./middleware/rateLimit.js";
import {authRouter} from "./routes/auth.js";
import {savesRouter} from "./routes/saves.js";

const PORT = Number(process.env.PORT ?? 5105);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(blessing);
app.use(express.json({limit: "4mb"}));

if (ALLOWED_ORIGINS.length > 0) {
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow same-origin / curl (no Origin header) and whitelisted hosts.
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
          cb(null, true);
          return;
        }
        cb(new Error(`origin-not-allowed: ${origin}`));
      },
      credentials: false,
      maxAge: 600,
    }),
  );
}

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
  });
});

app.use("/v1", generalLimiter);
app.use("/v1/auth", authRouter);
app.use("/v1", savesRouter);

app.use((req, res) => {
  res.status(404).json({error: "not-found", path: req.path});
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({error: "validation-failed", details: err.flatten()});
    return;
  }
  if (err instanceof Error) {
    console.error("[cloudsave]", err.message);
    res.status(500).json({error: "internal-error", message: err.message});
    return;
  }
  res.status(500).json({error: "internal-error"});
});

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME} v${SERVICE_VERSION}] ${BLESSING}`);
  console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
});
