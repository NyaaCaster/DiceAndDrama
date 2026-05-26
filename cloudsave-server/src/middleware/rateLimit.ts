import rateLimit from "express-rate-limit";

// Strict limiter for credential-bearing endpoints (register / login). Five
// attempts per 15 minutes per IP — enough to recover from typos, low enough
// to make online password-guessing impractical.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {error: "too-many-attempts", retryAfter: "15m"},
});

// Generous limiter for everything else. 60 req/min per IP keeps the API
// responsive while shielding against runaway clients.
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
