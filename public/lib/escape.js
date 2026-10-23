/* Escaping condiviso fra server e browser.
   Tutto il testo che arriva dal database (nomi, descrizioni, impostazioni)
   passa da qui prima di finire dentro l'HTML. */

const ENTITA = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(valore) {
  return String(valore ?? "").replace(/[&<>"']/g, c => ENTITA[c]);
}

/* JSON da incorporare in <script type="application/json">: senza questi
   escape un testo come "</script>" chiuderebbe il tag in anticipo. */
export function jsonPerHtml(oggetto) {
  return JSON.stringify(oggetto).replace(/[<>&\u2028\u2029]/g,
    c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}
