// @ts-nocheck — cópia de ptw-mockup-v2/src/core/templatePackage.ts; não edite (node scripts/sync-shared.mjs)
/**
 * "ptw.modelo/1": the portable package a plant's permit form becomes. A skill run outside the app
 * (Claude Code, `ptw-modelo-de-formulario`) reads the paper and writes this file; the app imports it
 * as a DRAFT version. References are by name (cargo, tipo de local/ativo, lista), never by internal
 * id, so the same file also moves a model between plants (`exportarModelo`).
 *
 * Pure: no React, no globals, the clock comes in `agora`. The import never activates anything:
 * the version it builds is always "rascunho" and a person reviews and activates it in the app.
 *
 * Imports use the ".ts" extension so `node scripts/validar-modelo.ts` runs this file directly.
 *
 * This file is only the entry: the code lives in `templatePackage/` (types, schema, text, import,
 * apply, export, report). Import from here, never from the folder.
 */
export * from "./templatePackage/types.ts"
export * from "./templatePackage/schema.ts"
export * from "./templatePackage/text.ts"
export * from "./templatePackage/import.ts"
export * from "./templatePackage/apply.ts"
export * from "./templatePackage/export.ts"
export * from "./templatePackage/report.ts"
