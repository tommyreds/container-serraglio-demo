/* Foto dei prodotti caricate dal pannello.
   Il telefono del titolare le ritaglia e rimpicciolisce prima di mandarle;
   qui si controlla soltanto che siano davvero immagini, guardando i byte e
   non il nome o il tipo dichiarato. Gli SVG sono esclusi: possono contenere
   script. I file finiscono fuori da public/ con un nome casuale. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ESTENSIONI = { webp: "webp", jpeg: "jpg", png: "png" };
export const TIPI_MIME = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };
export const NOME_VALIDO = /^[0-9a-f]{16}\.(webp|jpg|png)$/;

export function tipoImmagine(buf) {
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  return null;
}

/* Larghezza e altezza lette dall'intestazione, senza decodificare. */
export function dimensioniImmagine(buf, tipo) {
  try {
    if (tipo === "png") {
      if (buf.toString("latin1", 12, 16) !== "IHDR") return null;
      return { larghezza: buf.readUInt32BE(16), altezza: buf.readUInt32BE(20) };
    }
    if (tipo === "jpeg") {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) return null;
        // lo standard ammette byte 0xFF di riempimento prima del marcatore
        while (buf[i + 1] === 0xff && i + 10 < buf.length) i++;
        const marcatore = buf[i + 1];
        const lungo = buf.readUInt16BE(i + 2);
        // SOF0..SOF15 tranne DHT (C4), JPG (C8) e DAC (CC)
        if (marcatore >= 0xc0 && marcatore <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcatore)) {
          return { larghezza: buf.readUInt16BE(i + 7), altezza: buf.readUInt16BE(i + 5) };
        }
        i += 2 + lungo;
      }
      return null;
    }
    if (tipo === "webp") {
      const pezzo = buf.toString("latin1", 12, 16);
      if (pezzo === "VP8 ") {
        if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
        return { larghezza: buf.readUInt16LE(26) & 0x3fff, altezza: buf.readUInt16LE(28) & 0x3fff };
      }
      if (pezzo === "VP8L") {
        if (buf[20] !== 0x2f) return null;
        const bit = buf.readUInt32LE(21);
        return { larghezza: (bit & 0x3fff) + 1, altezza: ((bit >> 14) & 0x3fff) + 1 };
      }
      if (pezzo === "VP8X") {
        return { larghezza: buf.readUIntLE(24, 3) + 1, altezza: buf.readUIntLE(27, 3) + 1 };
      }
    }
  } catch { /* intestazione troncata */ }
  return null;
}

export function salvaFoto(cartella, buf, tipo) {
  const nome = `${crypto.randomBytes(8).toString("hex")}.${ESTENSIONI[tipo]}`;
  fs.writeFileSync(path.join(cartella, nome), buf, { flag: "wx" });
  return nome;
}

export function eliminaFoto(cartella, nome) {
  if (!NOME_VALIDO.test(String(nome))) return;
  fs.rmSync(path.join(cartella, nome), { force: true });
}
