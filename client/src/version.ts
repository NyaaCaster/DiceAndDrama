/**
 * Single source of truth for runtime version + signature constants.
 *
 * BLESSING is referenced from main.tsx (boot log) and App.tsx (data attribute)
 * so it always lands in the production bundle. Do not move it into a comment;
 * Terser will strip comments from the JS output. See .docs/code-signature.md.
 */
export const BLESSING = "Nyaa be with you." as const;
export const APP_NAME = "Dice & Drama" as const;
export const APP_VERSION = "0.1.0" as const;
