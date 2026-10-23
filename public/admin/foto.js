/* Foto dal telefono: ritagliata e rimpicciolita prima di partire.
   Una foto della fotocamera pesa 3-6 MB; ritagliata a 640×512 in WebP
   ne pesa 40-80 KB e si carica anche con poco campo. Safari vecchi non
   sanno fare WebP dal canvas: in quel caso si manda JPEG. */

const LARGHEZZA = 640;
const ALTEZZA = 512;   // 5:4, come le schede del menù

const blob = (canvas, tipo, qualita) => new Promise(ok => canvas.toBlob(ok, tipo, qualita));

export async function preparaFoto(file) {
  const immagine = await createImageBitmap(file, { imageOrientation: "from-image" });
  // ritaglio al centro nella proporzione 5:4
  const rapporto = LARGHEZZA / ALTEZZA;
  let w = immagine.width;
  let h = Math.round(w / rapporto);
  if (h > immagine.height) { h = immagine.height; w = Math.round(h * rapporto); }
  const x = Math.round((immagine.width - w) / 2);
  const y = Math.round((immagine.height - h) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = LARGHEZZA;
  canvas.height = ALTEZZA;
  const g = canvas.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(immagine, x, y, w, h, 0, 0, LARGHEZZA, ALTEZZA);
  immagine.close?.();

  const webp = await blob(canvas, "image/webp", 0.82);
  if (webp && webp.type === "image/webp") return webp;
  return blob(canvas, "image/jpeg", 0.85);
}
