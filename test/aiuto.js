/* Strumenti condivisi dai test: database in memoria già popolato. */
import { apriDb } from "../server/db.js";
import { semina } from "../server/seed.js";

export const PIN_PROVA = "482915";

export function dbDiProva() {
  const db = apriDb(":memory:");
  semina(db, { pin: PIN_PROVA });
  return db;
}
