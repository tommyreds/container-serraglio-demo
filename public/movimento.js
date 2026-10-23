/* Movimento: solo come risposta a un gesto.
   Toccando "+" il pulsante fa un piccolo salto, un pallino vola fino al
   vassoio e il totale conta fino al nuovo valore. Il resto (entrata
   dell'hero, fogli che salgono) è CSS. Niente animazioni allo scorrimento.
   Con "riduci movimento" attivo nel sistema non parte niente. */

import { euro } from "./lib/whatsapp.js";

const ridotto = matchMedia("(prefers-reduced-motion: reduce)");

export function animaAggiunta(da, verso) {
  if (ridotto.matches || !da || !verso || verso.hidden) return;
  da.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }],
    { duration: 300, easing: "cubic-bezier(.2,.9,.3,1.4)" });

  const a = da.getBoundingClientRect();
  const b = verso.querySelector(".conta")?.getBoundingClientRect() || verso.getBoundingClientRect();
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const pallino = document.createElement("span");
  pallino.className = "pallino-volo";
  pallino.setAttribute("aria-hidden", "true");
  pallino.style.left = `${a.left + a.width / 2 - 7}px`;
  pallino.style.top = `${a.top + a.height / 2 - 7}px`;
  document.body.append(pallino);
  // arco: sale un po' prima di scendere verso la barra
  const volo = pallino.animate([
    { transform: "translate(0, 0) scale(1)" },
    { transform: `translate(${dx * .5}px, ${Math.min(dy * .5, 0) - 60}px) scale(1.1)`, offset: .45 },
    { transform: `translate(${dx}px, ${dy}px) scale(.6)` }
  ], { duration: 450, easing: "cubic-bezier(.3,.7,.4,1)" });
  volo.onfinish = () => {
    pallino.remove();
    verso.animate([{ transform: "scale(1)" }, { transform: "scale(1.04)" }, { transform: "scale(1)" }],
      { duration: 220, easing: "ease-out" });
  };
}

export function contaFino(el, valore) {
  const da = Number(el.dataset.valore ?? valore);
  el.dataset.valore = String(valore);
  if (ridotto.matches || da === valore) { el.textContent = euro(valore); return; }
  const inizio = performance.now();
  const passo = t => {
    const k = Math.min(1, (t - inizio) / 300);
    const v = da + (valore - da) * (1 - (1 - k) ** 3);
    el.textContent = euro(k < 1 ? Math.round(v * 100) / 100 : valore);
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

document.addEventListener("vassoio:aggiunto", ev => animaAggiunta(ev.detail.da, document.getElementById("barra-vassoio")));
document.addEventListener("vassoio:totale", ev => contaFino(ev.detail.el, ev.detail.valore));
