// @ts-nocheck — cópia de ptw-mockup-v2/src/core/audit.ts; não edite (node scripts/sync-shared.mjs)
/**
 * The audit trail: one append-only log per unit, chained by SHA-256, exactly as the database keeps it
 * (ptw-server/db/schema/50_auditoria.sql). It is also the PT Histórico (filtered by permit). Pure: no
 * React, no clock, no randomness.
 *
 * Canonical form v2 (the same as the database and tools/ptw_verifica.py, byte for byte):
 *   hash = SHA-256( prev (32 bytes) ‖ UTF-8( canonical JSON of the event ) ); the first prev is 32 zero bytes.
 *   Event keys: action actor asset at auth client data entity entity_id ok permit reason request rev role
 *   seq text unit v (v = 2; at = microseconds since 1970 UTC, integer; uuid lowercase; absent = null).
 *   Object: "{" + `"key": value` joined by ", " + "}", keys ordered by UTF-8 byte length, then byte by
 *   byte. List: "[" + values joined by ", " + "]". Text: escapes only \" \\ \b \f \n \r \t and \u00xx
 *   (lowercase) below 0x20, the rest literal UTF-8. Number: plain decimal, never an exponent; -0 is 0.
 * `data` keeps the database's shape: row writes are {"de": {…}, "para": {…}} with column names and raw
 * values, only what changed; the sentence for people is built when reading (`eventChanges`).
 *
 * This file is only the entry: the code lives in `audit/` (sha256, types, canonical, micros, drafts, chain, reading, export). Import from here, never from the folder.
 */
export * from "./audit/sha256.ts"
export * from "./audit/types.ts"
export * from "./audit/canonical.ts"
export * from "./audit/micros.ts"
export * from "./audit/drafts.ts"
export * from "./audit/chain.ts"
export * from "./audit/reading.ts"
export * from "./audit/export.ts"
