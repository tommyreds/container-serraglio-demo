import express from "express";
import { leggiMenu, leggiOrari, leggiChiusure, leggiImpostazioni } from "../db.js";
import { oraRoma } from "../../public/lib/orari.js";

export function rottePubbliche({ db, now }) {
  const r = express.Router();

  r.get("/salute", (req, res) => {
    db.prepare("SELECT 1").get();
    res.set("Cache-Control", "no-store").json({ ok: true });
  });

  /* Menù in JSON: il browser lo rilegge quando si apre il vassoio, per
     accorgersi di un prodotto finito nel frattempo. */
  r.get("/api/menu", (req, res) => {
    const oggi = oraRoma(now()).data;
    res.set("Cache-Control", "no-cache").json({
      oggi,
      categorie: leggiMenu(db, { oggi }),
      orari: leggiOrari(db),
      chiusure: leggiChiusure(db, oggi),
      impostazioni: leggiImpostazioni(db)
    });
  });

  return r;
}
