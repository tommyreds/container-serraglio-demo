import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tipoImmagine, dimensioniImmagine, salvaFoto, eliminaFoto } from "../server/foto.js";
import { avviaProva } from "./aiuto.js";

// PNG vero di 1×1 pixel
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

// intestazione JPEG con un segmento APP0 e poi SOF0 640×480
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01
]);

const riff = (tipo, corpo) => {
  const dati = Buffer.concat([Buffer.from("WEBP"), Buffer.from(tipo, "latin1"), Buffer.alloc(4), corpo]);
  dati.writeUInt32LE(corpo.length, 8);
  const testa = Buffer.from("RIFF\0\0\0\0", "latin1");
  testa.writeUInt32LE(dati.length, 4);
  return Buffer.concat([testa, dati]);
};
// VP8 con perdita: frame tag, codice d'inizio, larghezza e altezza a 14 bit
const WEBP_VP8 = riff("VP8 ", Buffer.from([0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0x00, 0x02, 0, 0]));
// VP8X: flag, poi larghezza-1 e altezza-1 su 24 bit
const WEBP_VP8X = riff("VP8X", Buffer.from([0, 0, 0, 0, 0x7f, 0x02, 0x00, 0xff, 0x01, 0x00]));

test("riconosce i tipi dai byte, non dal nome", () => {
  assert.equal(tipoImmagine(PNG), "png");
  assert.equal(tipoImmagine(JPEG), "jpeg");
  assert.equal(tipoImmagine(WEBP_VP8), "webp");
  assert.equal(tipoImmagine(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')), null);
  assert.equal(tipoImmagine(Buffer.alloc(0)), null);
});

test("dimensioni dalle intestazioni", () => {
  assert.deepEqual(dimensioniImmagine(PNG, "png"), { larghezza: 1, altezza: 1 });
  assert.deepEqual(dimensioniImmagine(JPEG, "jpeg"), { larghezza: 640, altezza: 480 });
  assert.deepEqual(dimensioniImmagine(WEBP_VP8, "webp"), { larghezza: 640, altezza: 512 });
  assert.deepEqual(dimensioniImmagine(WEBP_VP8X, "webp"), { larghezza: 640, altezza: 512 });
  assert.equal(dimensioniImmagine(Buffer.from([0xff, 0xd8, 0xff]), "jpeg"), null);
});

test("salvaFoto ed eliminaFoto", () => {
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), "foto-"));
  const nome = salvaFoto(cartella, PNG, "png");
  assert.match(nome, /^[0-9a-f]{16}\.png$/);
  assert.ok(fs.existsSync(path.join(cartella, nome)));
  eliminaFoto(cartella, nome);
  assert.ok(!fs.existsSync(path.join(cartella, nome)));
  fs.rmSync(cartella, { recursive: true });
});

test("eliminaFoto ignora nomi con percorsi", () => {
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), "foto-"));
  fs.writeFileSync(path.join(cartella, "..", "da-non-toccare.txt"), "x");
  eliminaFoto(cartella, "../da-non-toccare.txt");
  assert.ok(fs.existsSync(path.join(cartella, "..", "da-non-toccare.txt")));
  fs.rmSync(path.join(cartella, "..", "da-non-toccare.txt"));
  fs.rmSync(cartella, { recursive: true });
});

async function carica(p, cookie, corpo, tipo = "image/png") {
  return p.richiesta("PUT", "/api/admin/prodotti/sc1/foto", { cookie, grezzo: corpo, tipo });
}

test("upload valido poi servito con nosniff e cache lunga", async () => {
  const p = await avviaProva();
  const c = await p.accedi();
  const r = await carica(p, c, PNG);
  assert.equal(r.stato, 200);
  assert.match(r.json.foto, /^foto\/[0-9a-f]{16}\.png$/);
  assert.equal(p.db.prepare("SELECT foto FROM prodotti WHERE id = 'sc1'").get().foto, r.json.foto);
  const servita = await fetch(`${p.base}/${r.json.foto}`);
  assert.equal(servita.status, 200);
  assert.equal(servita.headers.get("content-type"), "image/png");
  assert.equal(servita.headers.get("x-content-type-options"), "nosniff");
  assert.equal(servita.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.deepEqual(Buffer.from(await servita.arrayBuffer()), PNG);
  await p.chiudi();
});

test("una nuova foto cancella la precedente; rimuovi torna all'illustrazione", async () => {
  const p = await avviaProva();
  const c = await p.accedi();
  const prima = (await carica(p, c, PNG)).json.foto;
  const seconda = (await carica(p, c, JPEG, "image/jpeg")).json.foto;
  assert.match(seconda, /\.jpg$/);
  assert.ok(!fs.existsSync(path.join(p.cartellaFoto, prima.slice(5))));
  assert.equal((await p.richiesta("DELETE", "/api/admin/prodotti/sc1/foto", { cookie: c })).stato, 200);
  assert.equal(p.db.prepare("SELECT foto FROM prodotti WHERE id = 'sc1'").get().foto, null);
  assert.ok(!fs.existsSync(path.join(p.cartellaFoto, seconda.slice(5))));
  await p.chiudi();
});

test("eliminare un prodotto cancella anche la sua foto caricata", async () => {
  const p = await avviaProva();
  const c = await p.accedi();
  const foto = (await carica(p, c, PNG)).json.foto;
  await p.richiesta("DELETE", "/api/admin/prodotti/sc1", { cookie: c });
  assert.ok(!fs.existsSync(path.join(p.cartellaFoto, foto.slice(5))));
  await p.chiudi();
});

test("upload SVG travestito: 415", async () => {
  const p = await avviaProva();
  const c = await p.accedi();
  const r = await carica(p, c, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
  assert.equal(r.stato, 415);
  assert.equal(r.json.errore, "Usa una foto JPG, PNG o WebP.");
  assert.equal((await carica(p, c, PNG, "image/svg+xml")).stato, 415);
  await p.chiudi();
});

test("upload troppo grande: 413", async () => {
  const p = await avviaProva();
  const c = await p.accedi();
  const r = await carica(p, c, Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]));
  assert.equal(r.stato, 413);
  assert.equal(r.json.errore, "La foto è troppo grande (massimo 3 MB).");
  await p.chiudi();
});

test("immagine illeggibile: 400", async () => {
  const p = await avviaProva();
  const c = await p.accedi();
  const r = await carica(p, c, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 2]), "image/jpeg");
  assert.equal(r.stato, 400);
  assert.equal(r.json.errore, "Non riesco a leggere questa foto, provane un'altra.");
  await p.chiudi();
});

test("upload senza sessione o da altra origine", async () => {
  const p = await avviaProva();
  assert.equal((await carica(p, null, PNG)).stato, 401);
  const c = await p.accedi();
  const r = await p.richiesta("PUT", "/api/admin/prodotti/sc1/foto", { cookie: c, grezzo: PNG, tipo: "image/png", origine: "https://evil.example" });
  assert.equal(r.stato, 403);
  await p.chiudi();
});

test("nomi foto non validi: 404", async () => {
  const p = await avviaProva();
  for (const percorso of ["/foto/..%2Fserver.js", "/foto/abc.png", "/foto/0123456789abcdef.svg"]) {
    assert.equal((await fetch(p.base + percorso)).status, 404, percorso);
  }
  await p.chiudi();
});
