// @ts-nocheck — cópia de ptw-mockup-v2/src/core/form.ts; não edite (node scripts/sync-shared.mjs)
/**
 * The form engine, pure: what an administrator built (validation) and how a filled-in form stands
 * (section status). The same functions serve the editor's preview, Nova PT and the signing gate.
 * No React, no globals.
 *
 * This file is only the entry: the code lives in `form/` (answers, masks, conditions, status, validate, permit). Import from here, never from the folder.
 */
export * from "./form/answers.ts"
export * from "./form/masks.ts"
export * from "./form/conditions.ts"
export * from "./form/status.ts"
export * from "./form/validate.ts"
export * from "./form/permit.ts"
