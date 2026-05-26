/**
 * Single source of truth for runtime version + signature constants.
 *
 * BLESSING is referenced from index.ts (boot log) and middleware/blessing.ts
 * (X-Blessing response header) so it always lands in the runtime bundle.
 * Do not move it into a comment; the build pipeline strips comments. See
 * .docs/code-signature.md.
 */
export const BLESSING = "Nyaa be with you." as const;
export const SERVICE_NAME = "cloudsave" as const;
export const SERVICE_VERSION = "0.1.0" as const;
